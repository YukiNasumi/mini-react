const { createElement: h, render, useState } = MiniReact;

function CounterCard({ label }) {
  const [count, setCount] = useState(0);

  return h(
    "li",
    {
      style: {
        border: "1px solid #ddd",
        borderRadius: "8px",
        padding: "10px",
        marginBottom: "8px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      },
    },
    h("span", null, `${label}: ${count}`),
    h(
      "button",
      {
        onClick: () => setCount((v) => v + 1),
      },
      "+1"
    )
  );
}

function App() {
  const [reverse, setReverse] = useState(false);
  const [items, setItems] = useState([
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
    { id: "c", label: "Gamma" },
  ]);

  const visibleItems = reverse ? [...items].reverse() : items;

  return h(
    "div",
    {
      style: {
        maxWidth: "480px",
        margin: "24px auto",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
      },
    },
    h("h2", null, "Mini React: useState + keyed diff"),
    h(
      "p",
      null,
      "先给每个卡片点 +1，再点 reverse。如果 key 生效，计数会跟着卡片而不是位置。"
    ),
    h(
      "div",
      { style: { display: "flex", gap: "8px", marginBottom: "12px" } },
      h(
        "button",
        {
          onClick: () => setReverse((v) => !v),
        },
        reverse ? "normal order" : "reverse"
      ),
      h(
        "button",
        {
          onClick: () => {
            const id = Math.random().toString(36).slice(2, 7);
            setItems((prev) => [...prev, { id, label: `New-${id}` }]);
          },
        },
        "append item"
      )
    ),
    h(
      "ul",
      { style: { listStyle: "none", padding: 0, margin: 0 } },
      visibleItems.map((item) =>
        h(CounterCard, {
          key: item.id,
          label: item.label,
        })
      )
    )
  );
}

const root = document.getElementById("root");
render(h(App, null), root);
