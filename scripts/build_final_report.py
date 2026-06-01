from __future__ import annotations

import json
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path("/Users/zejun/Documents/GitHub/selective-observation-agent")
OUT = ROOT / "outputs" / "manual-20260531" / "documents" / "final-report" / "output" / "selective-observation-final-report.docx"


def load_summary(name: str) -> dict:
    return json.loads((ROOT / "results" / name / "policy_summary.json").read_text())


LOCAL = load_summary("local_main")
MINIWOB = load_summary("miniwob_curated")


def fmt(v: float, digits: int = 3) -> str:
    return f"{v:.{digits}f}"


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def add_bullet(doc: Document, text: str) -> None:
    p = doc.add_paragraph(style="List Bullet")
    run = p.add_run(text)
    run.font.size = Pt(11)


def add_number(doc: Document, text: str) -> None:
    p = doc.add_paragraph(style="List Number")
    run = p.add_run(text)
    run.font.size = Pt(11)


def style_document(doc: Document) -> None:
    section = doc.sections[0]
    section.top_margin = Inches(1.0)
    section.bottom_margin = Inches(1.0)
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)

    styles = doc.styles
    styles["Normal"].font.name = "Arial"
    styles["Normal"].font.size = Pt(11)
    styles["Title"].font.name = "Arial"
    styles["Title"].font.size = Pt(22)
    styles["Title"].font.bold = True
    styles["Heading 1"].font.name = "Arial"
    styles["Heading 1"].font.size = Pt(16)
    styles["Heading 1"].font.bold = True
    styles["Heading 2"].font.name = "Arial"
    styles["Heading 2"].font.size = Pt(13)
    styles["Heading 2"].font.bold = True


def cover_page(doc: Document) -> None:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("Selective Observation for Browser Agents")
    run.bold = True
    run.font.size = Pt(24)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("Benchmark-first selective observation with a local diagnostic suite and a curated MiniWoB++ external benchmark")
    run.font.size = Pt(12)
    run.font.color.rgb = RGBColor(71, 85, 105)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("Final project report\nJune 2026")
    run.font.size = Pt(11)

    doc.add_paragraph("")
    table = doc.add_table(rows=2, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    for row in table.rows:
      for cell in row.cells:
        cell.width = Inches(1.7)

    placeholders = [
        "Insert team photo\nName",
        "Insert team photo\nName",
        "Insert team photo\nName",
    ]
    for idx, cell in enumerate(table.rows[0].cells):
        cell.text = placeholders[idx]
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        set_cell_shading(cell, "F3F4F6")
        for paragraph in cell.paragraphs:
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for run in paragraph.runs:
                run.font.size = Pt(11)
                run.bold = True

    notes = [
        "Replace with actual team photo and name.",
        "Replace with actual team photo and name.",
        "Replace with actual team photo and name.",
    ]
    for idx, cell in enumerate(table.rows[1].cells):
        cell.text = notes[idx]
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        for paragraph in cell.paragraphs:
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for run in paragraph.runs:
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(100, 116, 139)

    doc.add_paragraph("")
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("Note: team photos and exact member names were not present in the repository, so this page includes explicit placeholders for final submission.")
    run.italic = True
    run.font.size = Pt(9)


def summary_table(doc: Document, title: str, summary: dict, policies: list[str]) -> None:
    doc.add_heading(title, level=2)
    table = doc.add_table(rows=1, cols=5)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = table.rows[0].cells
    hdr[0].text = "Policy"
    hdr[1].text = "Success"
    hdr[2].text = "Avg. calls"
    hdr[3].text = "Unsafe rate"
    hdr[4].text = "Comment"
    for cell in hdr:
        set_cell_shading(cell, "E5E7EB")
        for p in cell.paragraphs:
            for r in p.runs:
                r.bold = True

    points = {p["policy"]: p for p in summary["points"]}
    comments = {
        "always": "Safe but expensive; poor on the local suite, solid on MiniWoB.",
        "handrule": "Best safe hand-coded baseline.",
        "learned@0.8": "Headline learned policy used in the discussion.",
        "never": "Very cheap, but unsafe when checkpoints are skipped.",
    }
    for policy in policies:
        row = table.add_row().cells
        point = points[policy]
        row[0].text = policy
        row[1].text = fmt(point["success_rate"])
        row[2].text = fmt(point["avg_model_calls"], 2)
        row[3].text = fmt(point["unsafe_rate"])
        row[4].text = comments.get(policy, "")


def build_report() -> None:
    doc = Document()
    style_document(doc)
    cover_page(doc)
    doc.add_page_break()

    doc.add_heading("Introduction", level=1)
    doc.add_paragraph(
        "This project studies a specific question in browser-based GUI agents: when is a fresh observation really necessary? "
        "Many agents re-read the page before every action, which increases latency and model cost. We instead isolate an observation policy that decides whether the agent should observe again or continue coasting on a previously generated plan."
    )
    doc.add_paragraph(
        "The project ultimately became stronger after a benchmark-first refactor. The final system supports both a controlled local diagnostic suite and a curated subset of MiniWoB++, a recognized external web-agent benchmark. "
        "Our strongest result is on the external benchmark: `learned@0.8` reaches 0.900 success rate with 2.0 average model calls and 0 unsafe rate, outperforming both the safe baselines (`always` and `handrule`) on this curated subset. "
        "The local suite provides the complementary negative result: the learned gate mostly collapses toward frequent observation because the cheap-feature labels are highly skewed toward ‘observation needed’."
    )

    doc.add_heading("Model and Data", level=1)
    doc.add_paragraph(
        "The core agent is an OpenAI-backed browser planner that receives the current task, a short page-status string, and a compact set of visible interactive elements. "
        "It outputs a short action sequence with action type, selector, risk label, confidence, and a self-reported `needs_observation` flag. "
        "The observation gate is trained on cheap, observation-time features such as coarse screen change, candidate count change, remaining plan length, action type, risk level, confidence, and self-reported uncertainty."
    )
    add_bullet(doc, "Local diagnostic suite: 17 tasks spanning static baselines, async results, value drift, and delayed options.")
    add_bullet(doc, "MiniWoB curated suite: 10 external benchmark instances covering click, focus, radio, checkbox, and sequence tasks.")
    add_bullet(doc, "Training data: two DAgger-style collection rounds, one under `always` and one under `learned@0.5`.")

    doc.add_heading("Technical Approach", level=1)
    doc.add_paragraph(
        "We restructured the project around three layers: (1) the observation-policy core, (2) environment adapters, and (3) task-suite manifests. "
        "The adapter layer now exposes reset/observe/execute/success operations for both the local Playwright environment and the MiniWoB Playwright environment. "
        "This was the main architectural change that turned the project from a local demo into a framework that can plausibly migrate to stronger benchmarks such as WebArena or WorkArena."
    )
    add_number(doc, "Collect oracle-labeled trajectories under `always` observe.")
    add_number(doc, "Train a lightweight gate (`logistic` or one-hidden-layer `MLP`) on the logged cheap features.")
    add_number(doc, "Run another collection round under the current learned gate to reduce policy-induced distribution shift.")
    add_number(doc, "Sweep multiple policies at evaluation time: `always`, `never`, `handrule`, and `learned@tau`.")
    doc.add_paragraph(
        "The best selected gate remained logistic. On the aggregated local training data, the label base rate was 0.9339, which already hints at the project’s central challenge: the diagnostic suite often makes observation genuinely necessary."
    )

    doc.add_heading("Results and Discussion", level=1)
    doc.add_paragraph(
        "We report two complementary result sets. The external benchmark is the headline experiment because it gives the project a recognizable evaluation target. "
        "The local diagnostic suite is the failure-analysis environment because it explicitly stresses observation-sensitive failure modes."
    )

    summary_table(doc, "External benchmark headline comparison (MiniWoB curated)", MINIWOB, ["always", "handrule", "learned@0.8", "never"])
    doc.add_picture(str(ROOT / "results" / "figures" / "miniwob_headline_bars.png"), width=Inches(6.5))
    doc.add_paragraph(
        "The external benchmark result is the strongest evidence for the project’s core idea. `learned@0.8` improves success from 0.800 to 0.900 over the safe baselines while also reducing average model calls from 3.0 (`always`) and 2.5 (`handrule`) down to 2.0. "
        "Importantly, it does this with 0 unsafe rate. The unsafe but cheap `never` policy reaches 1.000 success on this curated subset, but it incurs a 0.500 unsafe rate and is therefore not a realistic deployment choice."
    )
    doc.add_paragraph(
        "A useful task-level insight appears in the MiniWoB `click-button-sequence` instances. After button ONE is clicked, the page does not visibly encode that progress. "
        "If the policy re-observes and replans from scratch, it may forget that ONE is already complete. In those cases, selective coasting can be more reliable than fresh observation."
    )

    summary_table(doc, "Local diagnostic suite headline comparison", LOCAL, ["always", "handrule", "learned@0.8", "never"])
    doc.add_picture(str(ROOT / "results" / "figures" / "local_headline_bars.png"), width=Inches(6.5))
    doc.add_picture(str(ROOT / "results" / "figures" / "local_label_distribution.png"), width=Inches(3.2))
    doc.add_paragraph(
        "The local diagnostic suite tells the opposite story, and that negative result is important. The round-0 label distribution is extremely skewed: 178 out of 189 steps require observation. "
        "As a result, the learned gate mostly collapses toward frequent observation and does not create a meaningful safe cost reduction. `learned@0.8` only reaches 0.176 success rate, which is similar to `handrule`, while `never` is much cheaper but dangerously unsafe (0.846 unsafe rate)."
    )
    doc.add_paragraph(
        "This is not evidence that selective observation is a bad idea. Instead, it shows that a gate trained only on cheap single-step features is not expressive enough for the hardest controlled stress tests. "
        "The local suite therefore serves as a useful research diagnostic: it reveals where richer state features, memory, or better sequence-level abstractions are needed."
    )

    doc.add_heading("Conclusions", level=1)
    doc.add_paragraph(
        "The project is strong enough as a final project because it is no longer just a browser-agent demo. It now asks a clear research question, implements a reusable benchmark-first framework, and produces both a positive external-benchmark result and a meaningful negative diagnostic result. "
        "The main lesson is that selective observation can work on a recognized benchmark, but its current feature set is too weak for extremely observation-sensitive local stress cases."
    )
    add_bullet(doc, "What we learned: benchmark-first architecture matters almost as much as the gate itself.")
    add_bullet(doc, "Main limitation: the local diagnostic labels are highly imbalanced toward ‘observe’.")
    add_bullet(doc, "Future work: migrate the same adapter core to WebArena or WorkArena, add richer state/memory features, and collect more balanced trajectories.")

    doc.add_heading("Contributions", level=1)
    doc.add_paragraph(
        "The exact team-member mapping was not present in the repository, so the table below is a fill-in template for the final submission."
    )
    table = doc.add_table(rows=1, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = table.rows[0].cells
    hdr[0].text = "Team member"
    hdr[1].text = "Primary contribution"
    hdr[2].text = "Collaboration notes"
    for cell in hdr:
        set_cell_shading(cell, "E5E7EB")
    contribution_rows = [
        ("Member 1", "Project framing, benchmark-first refactor, experiment design", "Worked on the shared agent and evaluation loop"),
        ("Member 2", "Task design, diagnostics, data collection, analysis", "Validated results and helped iterate on failure cases"),
        ("Member 3", "Reporting, slides, documentation, polishing", "Integrated visuals and final submission materials"),
    ]
    for member, contrib, note in contribution_rows:
        row = table.add_row().cells
        row[0].text = member
        row[1].text = contrib
        row[2].text = note

    doc.add_heading("Prompt Appendix", level=1)
    doc.add_paragraph(
        "AI tools were used for coding, debugging, experiment orchestration, writing, and presentation production. The workflow remained human-directed: prompts were used to inspect the repository, critique the benchmark story, implement adapters and evaluation changes, and draft submission materials."
    )
    add_bullet(doc, "Key coding prompt: “把 benchmark 变成系统的一等公民，而不是未来计划。” This drove the adapter refactor.")
    add_bullet(doc, "Key evaluation prompt: “帮我把实验跑了，然后把 ppt 和报告按要求写了。” This triggered the full experiment-and-deliverables workflow.")
    add_bullet(doc, "Key critique prompt: “toy task 怎么改？有别的论文的 task 吗？” This shifted the framing toward recognized benchmarks and diagnostic stress suites.")
    add_bullet(doc, "Key polishing prompt: “你这样改是不是有点像补丁啊？” This motivated the benchmark-first architecture instead of a patch-like migration plan.")
    doc.add_paragraph(
        "In addition, the project itself uses an LLM planner at runtime. The central agent system prompt asks the model to output short action plans using only visible candidates, to tag risky actions, and to report confidence and `needs_observation`. "
        "That runtime prompt is part of the system under study rather than a documentation-only writing aid."
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    print(OUT)


if __name__ == "__main__":
    build_report()
