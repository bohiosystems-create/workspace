"""
Bohio EstateMaster UI probe: step 1 of the UI-automation trial (not yet run against EstateMaster).

Opens an EstateMaster model and writes down every button, tab and field Windows can see in the
EstateMaster window, so the trial script (em_ui_trial.py) can press them by name.

Run on the Windows machine with EstateMaster, logged in to a normal desktop session:
    py -m pip install pywinauto pillow
    py em_ui_probe.py "C:\\Bohio\\Trial\\AlNarjis.emdf"

It pauses after opening the model. Open whatever dialog you want captured (for example
Office Links -> Excel), press Enter, and it dumps every open EstateMaster window again.
Type q and Enter to finish. Output goes to probe_out\\ next to this file: send that folder back.
"""
import os, re, sys, time
from pathlib import Path
from pywinauto import Desktop
from pywinauto.application import Application

HERE = Path(__file__).parent
OUT = HERE / "probe_out"
TITLE_RE = os.environ.get("EM_TITLE_RE", r".*EstateMaster.*")
OPEN_WAIT_S = float(os.environ.get("EM_OPEN_WAIT_S", "30"))


def em_windows():
    """Every top-level window whose title looks like EstateMaster, plus its dialogs."""
    wins = [w for w in Desktop(backend="uia").windows() if w.is_visible()]
    main = [w for w in wins if re.match(TITLE_RE, w.window_text() or "")]
    if not main:
        return []
    pid = main[0].process_id()
    return [w for w in wins if w.process_id() == pid]


def dump(tag):
    wins = em_windows()
    if not wins:
        print("No EstateMaster window found. Set EM_TITLE_RE if the title differs.")
        return
    for i, w in enumerate(wins):
        name = f"{tag}_{i}_{(w.window_text() or 'untitled')[:40]}".replace(" ", "_")
        name = "".join(c for c in name if c.isalnum() or c in "_-.")
        spec = Application(backend="uia").connect(handle=w.handle).window(handle=w.handle)
        spec.print_control_identifiers(filename=str(OUT / f"{name}.txt"))
        try:
            w.capture_as_image().save(OUT / f"{name}.png")
        except Exception as e:  # screenshots need Pillow and a visible desktop
            print("screenshot failed:", e)
        print("saved", name)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    model = Path(sys.argv[1]).resolve()
    OUT.mkdir(exist_ok=True)
    t0 = time.time()
    os.startfile(str(model))  # opens with EstateMaster through the .emdf file association
    deadline = time.time() + OPEN_WAIT_S
    while not em_windows() and time.time() < deadline:
        time.sleep(1)
    if not em_windows():
        sys.exit(f"EstateMaster did not open within {OPEN_WAIT_S:.0f}s")
    time.sleep(3)
    print(f"EstateMaster opened in {time.time() - t0:.1f}s")
    dump("00_opened")
    n = 1
    while input("Open the next dialog, then Enter (q to quit): ").strip().lower() != "q":
        dump(f"{n:02d}")
        n += 1
    print("Done. Send the probe_out folder.")


if __name__ == "__main__":
    main()
