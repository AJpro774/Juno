/** Bundled docs/src markdown for the in-IDE Docs panel. */

import intro from "../../docs/src/intro.md?raw";
import syntax from "../../docs/src/language/syntax.md?raw";
import types from "../../docs/src/language/types.md?raw";
import memory from "../../docs/src/language/memory.md?raw";
import state from "../../docs/src/language/state.md?raw";
import stdlib from "../../docs/src/language/stdlib.md?raw";
import controlFlow from "../../docs/src/language/control-flow.md?raw";
import engineOverview from "../../docs/src/engine/overview.md?raw";
import engineIntrinsics from "../../docs/src/engine/intrinsics.md?raw";
import engineJscene from "../../docs/src/engine/jscene.md?raw";
import engineAnimation from "../../docs/src/engine/animation.md?raw";
import engineEditor from "../../docs/src/engine/editor.md?raw";
import engineLevel from "../../docs/src/engine/level.md?raw";
import platformerTutorial from "../../docs/src/tutorials/platformer.md?raw";
import aiAssistant from "../../docs/src/projects/ai-assistant.md?raw";
import netlifyDoc from "../../docs/src/projects/netlify.md?raw";
import exportWebDoc from "../../docs/src/projects/export-web.md?raw";
import tutorialsDoc from "../../docs/src/projects/tutorials.md?raw";
import catCoffeeDoc from "../../docs/src/projects/cat-coffee.md?raw";
import licensingDoc from "../../docs/src/projects/licensing.md?raw";
import graphicsOverview from "../../docs/src/graphics/overview.md?raw";
import graphics2d from "../../docs/src/graphics/2d.md?raw";
import graphics3d from "../../docs/src/graphics/3d.md?raw";
import webgpuRuntime from "../../docs/src/webgpu/runtime.md?raw";

export type DocPage = {
  id: string;
  title: string;
  markdown: string;
};

export const DOC_PAGES: DocPage[] = [
  { id: "intro", title: "Introduction", markdown: intro },
  { id: "syntax", title: "Syntax", markdown: syntax },
  { id: "types", title: "Types", markdown: types },
  { id: "memory", title: "Memory", markdown: memory },
  { id: "state", title: "Module state", markdown: state },
  { id: "stdlib", title: "Standard library", markdown: stdlib },
  { id: "control-flow", title: "Control flow", markdown: controlFlow },
  { id: "engine-overview", title: "Engine overview", markdown: engineOverview },
  { id: "engine-intrinsics", title: "Host intrinsics", markdown: engineIntrinsics },
  { id: "engine-jscene", title: ".jscene scenes", markdown: engineJscene },
  { id: "engine-animation", title: "Animation", markdown: engineAnimation },
  { id: "engine-editor", title: "Visual editor", markdown: engineEditor },
  { id: "engine-level", title: "Making a level", markdown: engineLevel },
  { id: "platformer-tutorial", title: "Build a 2D platformer", markdown: platformerTutorial },
  { id: "ai-assistant", title: "AI assistant", markdown: aiAssistant },
  { id: "netlify", title: "Deploy to Netlify", markdown: netlifyDoc },
  { id: "export-web", title: "Export for web", markdown: exportWebDoc },
  { id: "tutorials", title: "Visual tutorials", markdown: tutorialsDoc },
  { id: "cat-coffee", title: "Themes & Cat Coffee", markdown: catCoffeeDoc },
  { id: "licensing", title: "Licensing", markdown: licensingDoc },
  { id: "graphics-overview", title: "Graphics overview", markdown: graphicsOverview },
  { id: "graphics-2d", title: "Canvas2D", markdown: graphics2d },
  { id: "graphics-3d", title: "3D", markdown: graphics3d },
  { id: "webgpu", title: "WebGPU runtime", markdown: webgpuRuntime },
];
