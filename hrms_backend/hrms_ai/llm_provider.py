"""Product-grade LLM provider — OpenAI-compatible chat + tool calling.

Enabled by environment (one variable flips the brain):
    AI_LLM_API_KEY    — your key (OpenAI, Groq, Gemini openai-compat, Ollama, vLLM)
    AI_LLM_BASE_URL   — default https://api.openai.com/v1
    AI_LLM_MODEL      — default gpt-4o-mini

When disabled (no key), the engine degrades gracefully to the analyst +
keyword layer — the app never depends on an external call. When enabled,
the LLM receives product context, the tool catalogue and conversation
history, decides which tools to call, and answers grounded in live data.
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 4


@dataclass
class LLMToolCall:
    id: str
    name: str
    arguments: Dict[str, Any]


@dataclass
class LLMResult:
    text: str
    tool_calls: List[LLMToolCall] = field(default_factory=list)
    provider: str = ""
    model: str = ""
    rounds: int = 0


class ProductLLMProvider:
    """OpenAI-compatible chat completions with a tool-calling loop."""

    def __init__(self):
        self.api_key = (os.getenv("AI_LLM_API_KEY") or "").strip()
        self.base_url = (os.getenv("AI_LLM_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
        self.model = (os.getenv("AI_LLM_MODEL") or "gpt-4o-mini").strip()
        self.timeout = float(os.getenv("AI_LLM_TIMEOUT", "45"))

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def describe(self) -> str:
        return f"{self.model}@{self.base_url}" if self.enabled else "disabled"

    async def complete(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.3,
    ) -> Dict[str, Any]:
        """Single chat-completions call. Returns the raw response dict."""
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(f"{self.base_url}/chat/completions",
                                     json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json()

    async def run_with_tools(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        execute_tool: Callable[[str, Dict[str, Any]], str],
        system_prompt: str,
    ) -> LLMResult:
        """Tool-calling loop: ask → execute tools → feed results → final answer."""
        convo = [{"role": "system", "content": system_prompt}] + list(messages)
        rounds = 0
        last_text = ""
        for _ in range(MAX_TOOL_ROUNDS):
            rounds += 1
            data = await self.complete(convo, tools=tools)
            choice = (data.get("choices") or [{}])[0]
            msg = choice.get("message") or {}
            tool_calls_raw = msg.get("tool_calls") or []
            content = (msg.get("content") or "").strip()
            if content:
                last_text = content
            if not tool_calls_raw:
                break
            calls: List[LLMToolCall] = []
            for tc in tool_calls_raw:
                fn = tc.get("function") or {}
                raw_args = fn.get("arguments") or "{}"
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
                except json.JSONDecodeError:
                    args = {}
                calls.append(LLMToolCall(id=tc.get("id", ""), name=fn.get("name", ""),
                                         arguments=args if isinstance(args, dict) else {}))
            convo.append({"role": "assistant", "content": content or None,
                          "tool_calls": tool_calls_raw})
            for call in calls:
                result_text = execute_tool(call.name, call.arguments)
                convo.append({
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": result_text[:6000],
                })
        return LLMResult(
            text=last_text or "I could not complete that request.",
            provider="llm",
            model=self.model,
            rounds=rounds,
        )


_provider: Optional[ProductLLMProvider] = None


def get_llm_provider() -> ProductLLMProvider:
    global _provider
    if _provider is None:
        _provider = ProductLLMProvider()
    return _provider
