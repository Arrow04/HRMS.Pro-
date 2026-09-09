"""
Background task processing for HRMS backend
"""
import asyncio
import logging
from typing import Callable, Any, Dict, List
from datetime import datetime
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class Task:
    id: str
    name: str
    func: Callable
    args: tuple = field(default_factory=tuple)
    kwargs: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    status: str = "pending"
    result: Any = None
    error: str = None


class BackgroundTaskQueue:
    def __init__(self, max_workers: int = 4):
        self.queue: asyncio.Queue = asyncio.Queue()
        self.workers: List[asyncio.Task] = []
        self.max_workers = max_workers
        self.tasks: Dict[str, Task] = {}
        self._running = False
    
    async def start(self):
        if self._running:
            return
        self._running = True
        for i in range(self.max_workers):
            worker = asyncio.create_task(self._worker(f"worker-{i}"))
            self.workers.append(worker)
        logger.info(f"Background task queue started with {self.max_workers} workers")
    
    async def stop(self):
        self._running = False
        for worker in self.workers:
            worker.cancel()
        await asyncio.gather(*self.workers, return_exceptions=True)
        logger.info("Background task queue stopped")
    
    async def _worker(self, name: str):
        while self._running:
            try:
                task = await asyncio.wait_for(self.queue.get(), timeout=1.0)
                task.status = "running"
                logger.info(f"{name} processing task {task.id}: {task.name}")
                try:
                    if asyncio.iscoroutinefunction(task.func):
                        result = await task.func(*task.args, **task.kwargs)
                    else:
                        result = task.func(*task.args, **task.kwargs)
                    task.result = result
                    task.status = "completed"
                    logger.info(f"{name} completed task {task.id}")
                except Exception as e:
                    task.error = str(e)
                    task.status = "failed"
                    logger.exception(f"{name} failed task {task.id}")
                finally:
                    self.queue.task_done()
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"{name} error: {e}")
    
    async def enqueue(self, name: str, func: Callable, *args, **kwargs) -> Task:
        task_id = f"{name}-{datetime.utcnow().timestamp()}"
        task = Task(id=task_id, name=name, func=func, args=args, kwargs=kwargs)
        self.tasks[task_id] = task
        await self.queue.put(task)
        logger.info(f"Enqueued task {task_id}: {name}")
        return task
    
    def get_task(self, task_id: str) -> Task:
        return self.tasks.get(task_id)


task_queue = BackgroundTaskQueue(max_workers=4)


async def start_background_tasks():
    await task_queue.start()


async def stop_background_tasks():
    await task_queue.stop()


def enqueue_background_task(name: str, func: Callable, *args, **kwargs) -> Task:
    return asyncio.run_coroutine_threadsafe(
        task_queue.enqueue(name, func, *args, **kwargs),
        asyncio.get_event_loop()
    ).result()
