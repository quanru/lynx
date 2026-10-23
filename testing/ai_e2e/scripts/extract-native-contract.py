"""Read source from stdin and extract supported original contracts without imports."""
import ast
import json
import sys

module = ast.parse(sys.stdin.read())
fixture = sys.argv[1]
constants = {}
tags = {}
text_selectors = {}
steps = ([{'node': 'wait', 'input': {'duration': 2000, 'unit': 'ms'}}]
         if fixture in ('textEvent', 'image', 'layoutLinear') else [])


def value(node):
    if isinstance(node, ast.Name) and node.id in constants:
        return constants[node.id]
    return ast.literal_eval(node)


def tag(node):
    if isinstance(node, ast.Name):
        return tags[node.id]
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == 'get_by_test_tag':
        return value(node.args[0])
    raise ValueError('Unsupported native target: ' + ast.dump(node))


for statement in module.body:
    if isinstance(statement, ast.Assign) and isinstance(statement.value, ast.Constant):
        constants[statement.targets[0].id] = value(statement.value)

run = next(node for node in module.body if isinstance(node, ast.FunctionDef) and node.name == 'run')
for statement in run.body:
    if isinstance(statement, ast.Assign):
        expression = statement.value
        if isinstance(expression, ast.Call) and isinstance(expression.func, ast.Attribute):
            if expression.func.attr == 'get_by_test_tag':
                tags[statement.targets[0].id] = tag(expression)
                continue
            if expression.func.attr == 'get_by_text':
                assert len(expression.args) == 1 and not expression.keywords
                text_selectors[statement.targets[0].id] = value(expression.args[0])
                continue
            if expression.func.attr in ('get_lynxview', 'get_session_id'):
                continue
        if isinstance(expression, ast.Attribute) and expression.attr == 'rect':
            tag(expression.value)
            continue
        raise ValueError('Unsupported native assignment: ' + ast.dump(statement))
    if not isinstance(statement, ast.Expr) or not isinstance(statement.value, ast.Call):
        raise ValueError('Unsupported native statement: ' + ast.dump(statement))
    call = statement.value
    name = ast.unparse(call.func)
    entry = {'fixture': fixture}
    if name == 'test.start_step':
        continue
    if name == 'time.sleep':
        if fixture == 'textEvent':
            assert len(call.args) == 1 and not call.keywords
            steps.append({'node': 'wait', 'input': {'duration': value(call.args[0]) * 1000, 'unit': 'ms'}})
        continue
    if name == 'utils.take_screenshot_check':
        assert fixture in ('textEvent', 'image', 'layoutLinear') and len(call.args) == 4 and not call.keywords
        assert isinstance(call.args[0], ast.Name) and call.args[0].id == 'test'
        assert value(call.args[2]) == ''
        assert isinstance(call.args[3], ast.Attribute) and call.args[3].attr == 'rect'
        entry.update(baseline=value(call.args[1]))
        if fixture == 'textEvent':
            entry['tag'] = tag(call.args[3].value)
        else:
            assert isinstance(call.args[3].value, ast.Name) and call.args[3].value.id == 'lynxview'
        steps.append({'node': 'native.pixels', 'input': entry})
        continue
    if name == 'send_cdp':
        entry['method'] = value(call.args[2])
        params = call.args[3]
        if entry['method'] == 'DOM.focus':
            assert isinstance(params, ast.Dict) and len(params.keys) == 1 and value(params.keys[0]) == 'nodeId'
            assert isinstance(params.values[0], ast.Attribute) and params.values[0].attr == 'id'
            entry['tag'] = tag(params.values[0].value)
        elif entry['method'] == 'Input.insertText':
            assert isinstance(params, ast.Dict) and len(params.keys) == 1 and value(params.keys[0]) == 'text'
            entry['text'] = value(params.values[0])
        else:
            raise ValueError('Unsupported native CDP method')
        steps.append({'node': 'native.cdp', 'input': entry})
    elif name == 'test.wait_for_equal':
        entry['tag'] = tag(call.args[1])
        property_name = value(call.args[2])
        expected = value(call.args[3])
        if property_name == 'text':
            entry['text'] = expected
        else:
            entry.update(attribute=property_name, equals=expected)
        for keyword in call.keywords:
            assert keyword.arg == 'timeout'
            entry['timeoutMs'] = value(keyword.value) * 1000
        steps.append({'node': 'native.expect', 'input': entry})
    elif name == 'assert_text':
        entry.update(tag=value(call.args[1]), text=value(call.args[2]), timeoutMs=0)
        steps.append({'node': 'native.expect', 'input': entry})
    elif name == 'test.assert_existing':
        timeout = value(call.args[2]) if len(call.args) > 2 else 3
        for keyword in call.keywords:
            assert keyword.arg in ('timeout', 'message')
            if keyword.arg == 'timeout':
                timeout = value(keyword.value)
        target = call.args[0]
        selector = {'matchingText': text_selectors[target.id]} if isinstance(target, ast.Name) and target.id in text_selectors else {'tag': tag(target)}
        entry.update(**selector, exists=True, timeoutMs=timeout * 1000)
        steps.append({'node': 'native.expect', 'input': entry})
    elif isinstance(call.func, ast.Attribute) and call.func.attr == 'click':
        steps.append({'node': 'click', 'input': {'tag': tag(call.func.value)}})
    else:
        raise ValueError('Unsupported native call: ' + name)

print(json.dumps(steps))
