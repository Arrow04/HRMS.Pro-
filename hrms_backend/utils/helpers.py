import re


def camel_to_snake(name: str) -> str:
    """Convert camelCase to snake_case"""
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()


def convert_camel_to_snake(data: dict) -> dict:
    """Convert all keys in a dictionary from camelCase to snake_case"""
    return {camel_to_snake(key): value for key, value in data.items()}


def snake_to_camel(name: str) -> str:
    """Convert snake_case to camelCase"""
    components = name.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


def convert_snake_to_camel(data: dict) -> dict:
    """Convert all keys in a dictionary from snake_case to camelCase"""
    return {snake_to_camel(key): value for key, value in data.items()}
