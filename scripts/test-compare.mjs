import { spawn } from "node:child_process";
import http from "node:http";
import WebSocket from "ws";

async function testCompare() {
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const proc = spawn(chromePath, [
    "--headless=new",
    "--remote-debugging-port=9226",
    "--disable-gpu",
    "--window-size=390,844",
    "http://localhost:8790/app.html#view=compare",
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  http.get("http://localhost:9226/json", (res) => {
    let d = "";
    res.on("data", (c) => (d += c));
    res.on("end", async () => {
      const tabs = JSON.parse(d);
      const tab = tabs.find((t) => t.url.includes("app.html"));
      if (!tab) {
        proc.kill();
        return;
      }

      const ws = new WebSocket(tab.webSocketDebuggerUrl);
      ws.on("open", async () => {
        let msgId = 1;
        const send = (m, p = {}) =>
          new Promise((resolve) => {
            const id = msgId++;
            const handler = (data) => {
              const parsed = JSON.parse(data);
              if (parsed.id === id) {
                ws.off("message", handler);
                resolve(parsed.result);
              }
            };
            ws.on("message", handler);
            ws.send(JSON.stringify({ id, method: m, params: p }));
          });

        await send("Runtime.enable");
        await new Promise((r) => setTimeout(r, 3500));

        const evalRes = await send("Runtime.evaluate", {
          expression: `(() => {
            const title = document.querySelector("h1")?.innerText;
            const rows = Array.from(document.querySelectorAll(".compare-matrix-table tbody tr")).map((r, rIdx) => {
              return Array.from(r.querySelectorAll("td")).map((td, cIdx) => ({
                cIdx,
                text: td.innerText.trim(),
                inputValue: td.querySelector("input, textarea")?.value,
                inputTag: td.querySelector("input, textarea")?.tagName
              }));
            });
            return {
              title,
              rowsCount: rows.length,
              sampleRow: rows[0]
            };
          })()`,
          returnByValue: true,
        });

        console.log("Compare eval:", JSON.stringify(evalRes.result.value, null, 2));
        ws.close();
        proc.kill();
        process.exit(0);
      });
    });
  });
}
testCompare();
