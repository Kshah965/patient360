import json

import pytest
import requests

from explanations import service
from explanations.service import Fact, Selection, explain, safety_facts, summary_facts


@pytest.fixture(autouse=True)
def no_paid_calls(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.setenv('LLM_ENABLED', '0')
    monkeypatch.setattr(service.requests, 'post', lambda *a, **k: pytest.fail('Unexpected paid API request'))


def facts():
    return [Fact(fact_id='alert-0', text='Backend supplied explanation.', source='Backend supplied source', reference='supplied-id')]


def enable(monkeypatch):
    monkeypatch.setenv('LLM_ENABLED', '1')
    monkeypatch.setenv('OPENAI_API_KEY', 'test-key-never-sent')


def test_missing_key_disabled_and_non_synthetic_fallback(monkeypatch):
    assert explain('SYN-1002', 'safety', facts()).reason == 'disabled'
    monkeypatch.setenv('LLM_ENABLED', '1')
    assert explain('SYN-1002', 'safety', facts()).reason == 'missing-key'
    enable(monkeypatch)
    assert explain('api-created', 'summary', facts()).reason == 'synthetic-only'


def test_unverified_and_incomplete_findings_never_enter_model_pool():
    alerts = [{'verified': True, 'explanation': 'Supplied fact', 'source': 'Supplied source', 'source_id': None},
              {'verified': False, 'explanation': 'Unverified', 'source': 'Unknown'},
              {'verified': True, 'explanation': 'TODO', 'source': 'Claimed source'}]
    pool, omitted = safety_facts(alerts)
    assert len(pool) == 1 and omitted == 2
    assert pool[0].text == 'Supplied fact'
    assert explain('p', 'safety', [], omitted=2).reason == 'no-eligible-findings'


def test_valid_structured_response_keeps_server_sources(monkeypatch):
    enable(monkeypatch)
    class Response:
        def raise_for_status(self): pass
        def json(self): return {'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': json.dumps({'items': [{'fact_id': 'alert-0', 'quote': 'Backend supplied explanation.'}]})}]}]}
    def fake_post(url, **kwargs):
        assert url == 'https://api.openai.com/v1/responses'
        assert kwargs['json']['model'] == 'gpt-4.1-mini'
        assert kwargs['json']['store'] is False
        assert kwargs['json']['text']['format']['strict'] is True
        assert kwargs['timeout'] == (3, 10)
        assert kwargs['allow_redirects'] is False
        return Response()
    monkeypatch.setattr(service.requests, 'post', fake_post)
    result = explain('SYN-1002', 'safety', facts(), synthetic_allowed=True)
    assert result.mode == 'llm-extractive'
    assert result.items == facts()
    assert result.items[0].reference == 'supplied-id'


@pytest.mark.parametrize('payload', [
    {'items': [{'fact_id': 'alert-0', 'quote': 'Invented advice'}]},
    {'items': []}, {'items': [{'fact_id': 'unknown', 'quote': 'Backend supplied explanation.'}]},
    {'items': [{'fact_id': 'alert-0', 'quote': 'Backend supplied explanation.', 'severity': 'safe'}]},
    {'items': [{'fact_id': 'alert-0', 'quote': 'Backend supplied explanation.'}], 'recommendation': 'new medicine'},
])
def test_injected_or_unsupported_output_falls_back(monkeypatch, payload):
    enable(monkeypatch)
    monkeypatch.setattr(service, '_request_selection', lambda *args: Selection.model_validate(payload))
    result = explain('SYN-1002', 'safety', facts(), synthetic_allowed=True)
    assert result.mode == 'template' and result.items == facts()


def test_timeouts_refusals_and_large_input_fall_back(monkeypatch):
    enable(monkeypatch)
    def timeout(*args): raise requests.Timeout('provider unavailable')
    monkeypatch.setattr(service, '_request_selection', timeout)
    assert explain('p', 'summary', facts(), synthetic_allowed=True).mode == 'template'
    assert explain('p', 'summary', [Fact(fact_id='huge', text='x' * 25000, source='record')], synthetic_allowed=True).reason == 'input-too-large'


def test_summary_templates_preserve_unknowns_and_no_known_allergies():
    p = {'criticalAlerts': [], 'allergies': {'status': 'unknown', 'items': []}, 'medications': None, 'conditions': None, 'history': [], 'encounters': None, 'vitals': None, 'observations': []}
    texts = [f.text for f in summary_facts(p)]
    assert 'Allergy information unavailable.' in texts
    assert 'Medication information unavailable.' in texts
    assert 'No known allergies documented.' not in texts
    p['allergies']['status'] = 'none-known'
    assert 'No known allergies documented.' in [f.text for f in summary_facts(p)]


@pytest.mark.parametrize('payload', [[], {'status': 'incomplete'}, {'status': 'completed', 'output': None},
    {'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'refusal', 'refusal': 'No output'}]}]},
    {'status': 'completed', 'output': ['bad message']}])
def test_provider_envelope_errors_use_templates(monkeypatch, payload):
    enable(monkeypatch)
    class Response:
        def raise_for_status(self): pass
        def json(self): return payload
    monkeypatch.setattr(service.requests, 'post', lambda *a, **k: Response())
    result = explain('p', 'safety', facts(), synthetic_allowed=True)
    assert result.mode == 'template' and result.items == facts()


def test_model_cannot_reprioritize_safety_excerpts(monkeypatch):
    enable(monkeypatch)
    pool = facts() + [Fact(fact_id='alert-1', text='Second backend fact.', source='Second source')]
    monkeypatch.setattr(service, '_request_selection', lambda *args: Selection.model_validate({'items': [{'fact_id': f.fact_id, 'quote': f.text} for f in reversed(pool)]}))
    result = explain('p', 'safety', pool, synthetic_allowed=True)
    assert result.mode == 'template' and result.items == pool
