/** In-IDE visual tutorial player: lesson packs under /tutorials/<id>/. */

export type TutorialStep = {
  image: string;
  caption: string;
  narration: string;
  highlight?: string;
  /** Optional absolute or lesson-relative audio path; defaults to step-N.mp3 */
  audio?: string;
};

export type TutorialLesson = {
  id: string;
  title: string;
  description?: string;
  steps: TutorialStep[];
};

export type TutorialCatalogEntry = {
  id: string;
  title: string;
  description?: string;
};

export type TutorialCatalog = {
  lessons: TutorialCatalogEntry[];
};

function tutorialsRoot(): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.endsWith("/") ? base : `${base}/`}tutorials`;
}

function lessonBase(id: string): string {
  return `${tutorialsRoot()}/${id}`;
}

function stepAssetUrl(lessonId: string, file: string): string {
  if (file.startsWith("http://") || file.startsWith("https://") || file.startsWith("/")) {
    return file;
  }
  return `${lessonBase(lessonId)}/${file}`;
}

/** Prefer step-N.mp3 naming when audio is omitted. */
function defaultAudioName(stepIndex: number): string {
  return `step-${stepIndex + 1}.mp3`;
}

export async function fetchTutorialCatalog(): Promise<TutorialCatalog> {
  const res = await fetch(`${tutorialsRoot()}/index.json`);
  if (!res.ok) throw new Error(`Failed to load tutorials catalog (${res.status})`);
  return (await res.json()) as TutorialCatalog;
}

export async function fetchTutorialLesson(id: string): Promise<TutorialLesson> {
  const res = await fetch(`${lessonBase(id)}/lesson.json`);
  if (!res.ok) throw new Error(`Failed to load lesson "${id}" (${res.status})`);
  const lesson = (await res.json()) as TutorialLesson;
  return { ...lesson, id: lesson.id || id };
}

export type TutorialPlayerDom = {
  panel: HTMLElement;
  lessonSelect: HTMLSelectElement;
  image: HTMLImageElement;
  caption: HTMLElement;
  progress: HTMLElement;
  prevBtn: HTMLButtonElement;
  nextBtn: HTMLButtonElement;
  speakBtn: HTMLButtonElement;
  stopBtn: HTMLButtonElement;
};

export class TutorialPlayer {
  private catalog: TutorialCatalogEntry[] = [];
  private lesson: TutorialLesson | null = null;
  private stepIndex = 0;
  private audio: HTMLAudioElement | null = null;
  private readonly missingAudio = new Set<string>();
  private readonly onKeyDown = (e: KeyboardEvent) => this.handleKey(e);

  constructor(private readonly dom: TutorialPlayerDom) {
    this.dom.prevBtn.addEventListener("click", () => this.go(-1));
    this.dom.nextBtn.addEventListener("click", () => this.go(1));
    this.dom.speakBtn.addEventListener("click", () => void this.speak());
    this.dom.stopBtn.addEventListener("click", () => this.stopSpeech());
    this.dom.lessonSelect.addEventListener("change", () => {
      const id = this.dom.lessonSelect.value;
      if (id) void this.loadLesson(id);
    });
  }

  async init(): Promise<void> {
    try {
      const catalog = await fetchTutorialCatalog();
      this.catalog = catalog.lessons;
    } catch (err) {
      this.dom.caption.textContent =
        err instanceof Error ? err.message : "Could not load tutorials.";
      this.dom.lessonSelect.innerHTML = "";
      return;
    }
    this.dom.lessonSelect.innerHTML = "";
    for (const entry of this.catalog) {
      const opt = document.createElement("option");
      opt.value = entry.id;
      opt.textContent = entry.title;
      this.dom.lessonSelect.appendChild(opt);
    }
    const first = this.catalog[0];
    if (first) await this.loadLesson(first.id);
  }

  setActive(active: boolean): void {
    if (active) {
      window.addEventListener("keydown", this.onKeyDown);
      void this.speak();
    } else {
      window.removeEventListener("keydown", this.onKeyDown);
      this.stopSpeech();
    }
  }

  private handleKey(e: KeyboardEvent): void {
    if (this.dom.panel.getAttribute("aria-hidden") === "true") return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      this.go(1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      this.go(-1);
    }
  }

  async loadLesson(id: string): Promise<void> {
    this.stopSpeech();
    try {
      this.lesson = await fetchTutorialLesson(id);
      this.stepIndex = 0;
      this.dom.lessonSelect.value = id;
      this.renderStep();
    } catch (err) {
      this.lesson = null;
      this.dom.caption.textContent =
        err instanceof Error ? err.message : "Could not load lesson.";
      this.dom.image.removeAttribute("src");
      this.dom.progress.textContent = "";
    }
  }

  private go(delta: number): void {
    if (!this.lesson) return;
    const next = this.stepIndex + delta;
    if (next < 0 || next >= this.lesson.steps.length) return;
    this.stepIndex = next;
    this.renderStep();
    void this.speak();
  }

  private renderStep(): void {
    if (!this.lesson) return;
    const step = this.lesson.steps[this.stepIndex];
    if (!step) return;
    const total = this.lesson.steps.length;
    const n = this.stepIndex + 1;
    this.dom.image.src = stepAssetUrl(this.lesson.id, step.image);
    this.dom.image.alt = step.caption;
    this.dom.caption.textContent = step.caption;
    this.dom.progress.textContent = `${n} / ${total}`;
    this.dom.prevBtn.disabled = this.stepIndex === 0;
    this.dom.nextBtn.disabled = this.stepIndex >= total - 1;
  }

  private audioUrlForStep(): string | null {
    if (!this.lesson) return null;
    const step = this.lesson.steps[this.stepIndex];
    if (!step) return null;
    const file = step.audio ?? defaultAudioName(this.stepIndex);
    return stepAssetUrl(this.lesson.id, file);
  }

  async speak(): Promise<void> {
    if (!this.lesson) return;
    const step = this.lesson.steps[this.stepIndex];
    if (!step) return;
    this.stopSpeech();

    const audioUrl = this.audioUrlForStep();
    if (audioUrl && (await this.tryPlayMp3(audioUrl))) return;

    if (!("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(step.narration);
    utter.rate = 1;
    window.speechSynthesis.speak(utter);
  }

  /** Probe for optional MP3; fall back quickly when missing. */
  private async tryPlayMp3(url: string): Promise<boolean> {
    if (this.missingAudio.has(url)) return false;
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!ok) {
          this.missingAudio.add(url);
          if (this.audio === audio) this.audio = null;
        }
        resolve(ok);
      };
      const timer = window.setTimeout(() => finish(false), 600);
      const audio = new Audio();
      audio.addEventListener("error", () => finish(false), { once: true });
      audio.addEventListener(
        "canplaythrough",
        () => {
          this.audio = audio;
          void audio.play().then(
            () => finish(true),
            () => finish(false)
          );
        },
        { once: true }
      );
      audio.preload = "auto";
      audio.src = url;
    });
  }

  stopSpeech(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }
}

export function wireTutorialPlayer(dom: TutorialPlayerDom): TutorialPlayer {
  return new TutorialPlayer(dom);
}
