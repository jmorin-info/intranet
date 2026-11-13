import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Avatar } from "../src/avatar";

function Fixture() {
  const [src, setSrc] = useState("/missing.png");
  return (
    <main>
      <Avatar src={src} initials="JM" data-testid="avatar" />
      <button onClick={() => setSrc("/avatar-good.png")}>Nouvelle photo</button>
      <button onClick={() => setSrc("/missing-again.png")}>Photo indisponible</button>
      <button onClick={() => setSrc("/avatar-good.png?v=2")}>Autre photo</button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
