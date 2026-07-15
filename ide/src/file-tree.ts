import {
  projectTreePaths,
  type ProjectState,
} from "./project-store";

export type FileTreeCallbacks = {
  onOpenFile: (path: string) => void;
};

function renderSection(
  label: string,
  paths: string[],
  activePath: string | null,
  onOpen: (path: string) => void
): HTMLElement | null {
  if (paths.length === 0) return null;

  const section = document.createElement("section");
  section.className = "file-tree-section";

  const head = document.createElement("div");
  head.className = "file-tree-section-head";
  head.textContent = label;
  section.appendChild(head);

  const list = document.createElement("ul");
  list.className = "file-tree-list";

  for (const path of paths) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "file-tree-item";
    btn.dataset.path = path;
    btn.textContent = path.includes("/") ? path.split("/").slice(1).join("/") : path;
    btn.title = path;
    btn.classList.toggle("is-active", path === activePath);
    btn.addEventListener("click", () => onOpen(path));
    li.appendChild(btn);
    list.appendChild(li);
  }

  section.appendChild(list);
  return section;
}

export function renderFileTree(
  host: HTMLElement,
  project: ProjectState | null,
  activePath: string | null,
  callbacks: FileTreeCallbacks
): void {
  host.textContent = "";

  if (!project) {
    const empty = document.createElement("p");
    empty.className = "file-tree-empty";
    empty.textContent = "Open a project or load the demo.";
    host.appendChild(empty);
    return;
  }

  const { config, src, assets, other } = projectTreePaths(project);
  const sections = [
    renderSection("Config", config, activePath, callbacks.onOpenFile),
    renderSection("src/", src, activePath, callbacks.onOpenFile),
    renderSection("assets/", assets, activePath, callbacks.onOpenFile),
    renderSection("Other", other, activePath, callbacks.onOpenFile),
  ];

  for (const section of sections) {
    if (section) host.appendChild(section);
  }
}
