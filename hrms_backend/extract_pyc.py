import marshal, types

with open(r'D:\hrmsnew\hrms_backend\__pycache__\main.cpython-314.pyc', 'rb') as f:
    f.read(16)  # header
    code = marshal.load(f)

def extract_funcs(code_obj, depth=0):
    prefix = '  ' * depth
    out = []
    for c in code_obj.co_consts:
        if isinstance(c, types.CodeType):
            args = ', '.join(c.co_varnames[:c.co_argcount])
            out.append(f'{prefix}def {c.co_name}({args}):')
            if c.co_consts and isinstance(c.co_consts[0], str):
                out.append(f'{prefix}  """{c.co_consts[0][:120]}"""')
            out.extend(extract_funcs(c, depth + 1))
    return out

lines = extract_funcs(code)
for l in lines:
    print(l)
print(f'\n--- Total: {len(lines)} functions ---')
print(f'--- Top-level names: {len(code.co_names)} ---')
