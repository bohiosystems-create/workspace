import { createRoot } from "react-dom/client";
import { boot } from "./browser-api";
import Home from "../app/page";

// Fira Sans + IBM Plex Sans Arabic (stand-ins for Kinan's Greta), added from script so a slow or blocked font host never delays startup.
const font = document.createElement("link");
font.rel = "stylesheet";
font.href = "https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;700&display=swap";
document.head.appendChild(font);

boot().then(() => createRoot(document.getElementById("root")!).render(<Home />));
