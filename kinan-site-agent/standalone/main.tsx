import { createRoot } from "react-dom/client";
import { boot } from "./browser-api";
import Home from "../app/page";

boot().then(() => createRoot(document.getElementById("root")!).render(<Home />));
