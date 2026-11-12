window.MATCH_PAIR_COPY = {
  "version": "MATCH-pair-copy-v1-en",
  "flags": {
    "AV-AM": { "level": "warn", "title": "Values", "text": "There is a values/integrity signal (low floor or marked gap). Talk openly about promises, information, and fair treatment." },
    "AV-RO": { "level": "bad", "title": "Values", "text": "Strong alert in values/integrity. A very low floor in this domain limits the recommendation (the index cannot stay High/Medium)." },
    "SO-AM": { "level": "warn", "title": "Socioemotional", "text": "There is a socioemotional signal (stress, treatment, withdrawal, or distance between profiles). Review how they handle conflict and pressure." },
    "SO-RO": { "level": "bad", "title": "Socioemotional", "text": "Strong socioemotional alert. Mediation is needed before any partnership agreement." },
    "SO-AM-AGR": { "level": "warn", "title": "Aggression", "text": "Signal of harshness or escalation in anger management in at least one person. Agree in writing what is unacceptable in a discussion and how to pause." },
    "SO-RO-AGR": { "level": "bad", "title": "Aggression", "text": "Strong alert: anger handled through confrontation without an assertive channel. Mediation is needed before any partnership agreement." },
    "SO-INFO-TIM": { "level": "warn", "title": "Timidity", "text": "One person tends to say yes when they should say no. Define how nos are asked for and received in the partnership." },
    "HA-AM": { "level": "warn", "title": "Habits", "text": "Signal in habits of follow-through and cooperation (deadlines, commitments, teamwork)." },
    "HA-RO": { "level": "bad", "title": "Habits", "text": "Strong alert in habits of follow-through and cooperation. A very low floor in this domain limits the recommendation." },
    "LI-AM": { "level": "warn", "title": "Leadership", "text": "Leadership gap: neither shows sufficient coverage. Define who decides and who executes, or add a third supporter." },
    "LI-INFO": { "level": "warn", "title": "Leadership", "text": "There is leadership coverage in one person. Clarify roles to avoid daily operations clashes." },
    "IN-AM": { "level": "warn", "title": "Intellectual", "text": "There is a reasoning gap of at least 2 items. It does not invalidate the pair alone, but they may need more time and concrete examples when deciding." },
    "VAL-EXT": { "level": "warn", "title": "Social desirability", "text": "Very favorable profile on integrity and habits. Confirm with concrete examples in the interview before approving the report. (Professional only.)" },
    "ATT-FAIL": { "level": "bad", "title": "Attention", "text": "Failed attention responses. Consider repeating the assessment." },
    "ATT-INFO": { "level": "warn", "title": "Attention", "text": "One of the two attention responses did not match. Informational note for the professional; does not block delivery." },
    "EC-OK": { "level": "ok", "title": "Economic", "text": "Risk appetite, patience, and financial cushion are compatible for day-to-day decisions." },
    "EC-AM-CAP": { "level": "warn", "title": "Economic", "text": "One person can afford to lose considerably more than the other. Agree early on salaries, who covers cash shortfalls, and how that affects equity split." },
    "EC-AM-RUNWAY": { "level": "warn", "title": "Economic", "text": "Neither partner has enough financial cushion or months without salary. Define how working capital will be funded initially." },
    "EC-AM-CTRL": { "level": "warn", "title": "Control", "text": "They differ on how much ownership they would give up for growth. Before seeking capital, decide whether to accept outside investors and on what terms." },
    "EC-RO": { "level": "bad", "title": "Control", "text": "Strong disagreement on control vs. growth: one wants full control; the other would accept investor control of the board. Resolve this before any formal agreement." },
    "EC-CRISIS": { "level": "info", "title": "Cash crisis", "text_template": "In a cash crisis, A would act first: {crisisA}; B would act first: {crisisB}. Which would you do together and who decides?" }
  },
  "recommendations": {
    "V": ["Define what business information must always be visible to both.", "Agree what happens if someone breaks a promise to the other or a client.", "Set how credit and responsibility are shared when something goes wrong."],
    "S": ["Define how each person signals tension and how soon you talk.", "Agree what is unacceptable in conflict (yelling, silence, threats).", "Define how nos are asked for and received in the partnership."],
    "H": ["Define which deadlines are fixed and which can be renegotiated.", "Agree how you notify each other if you will miss a deadline.", "Set which tasks belong to whom or are shared."],
    "L": ["Define who has the final word when there is no agreement.", "Agree who leads vision/sales and who leads operations/product.", "Set how the person who leads less is heard without stalling work."],
    "C": ["Explain a hard decision so both understand it the same way.", "Review numbers or assumptions together before investing.", "If one sees the problem faster, the other asks for concrete examples before deciding."],
    "E": ["Agree early on salaries, who covers cash shortfalls, and how that affects equity.", "Before seeking capital, decide whether to accept outside investors and on what terms.", "In a cash crisis: what each would do first, what you would do together, and who decides."]
  },
  "e10_options": {
    "A": "Cut costs so cash lasts longer",
    "B": "Put in personal funds and keep the original plan",
    "C": "Seek outside investors, even for a large equity stake",
    "D": "Pivot product or target market quickly to improve sales",
    "E": "Shut down in an orderly way to limit losses"
  },
  "bands": {}
};
