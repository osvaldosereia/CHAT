from bambuprep.ui.consent import run_consented_action


def test_declined_or_non_boolean_consent_never_starts_the_action():
    calls = []

    for answer in (False, None, 1, "yes"):
        result = run_consented_action(
            prompt=lambda answer=answer: answer,
            action=lambda consent: calls.append(consent),
        )
        assert result is None

    assert calls == []


def test_explicit_consent_passes_true_to_the_action():
    calls = []

    result = run_consented_action(
        prompt=lambda: True,
        action=lambda consent: calls.append(consent) or "started",
    )

    assert result == "started"
    assert calls == [True]


def test_each_recommendation_action_gets_a_fresh_consent_prompt():
    prompts = []
    actions = []

    for answer in (True, False, True):
        run_consented_action(
            prompt=lambda answer=answer: prompts.append("shown") or answer,
            action=lambda consent: actions.append(consent),
        )

    assert prompts == ["shown", "shown", "shown"]
    assert actions == [True, True]
