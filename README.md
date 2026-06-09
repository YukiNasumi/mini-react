# mini-react

一个教学用的最小 React 自实现，目标只覆盖三件事：

- 函数组件
- `useState` Hook
- 基于 `key + type` 的子节点 diff

## 快速运行

在目录下启动静态服务：

```bash
cd /home/zhiyuan/dev/mini-react
python3 -m http.server 5177
```

浏览器打开：`http://localhost:5177`

## 你会看到什么

- 点击每个卡片的 `+1`
- 再点击 `reverse`
- 如果 keyed diff 正常，计数会跟着具体卡片（`Alpha/Beta/Gamma`）走，而不是跟着位置走

这是理解 React `key` 最关键的实验。

## 核心实现说明

- `createElement`：把 JSX 心智模型变成虚拟节点对象
- `render/reconcile`：递归对比新旧树，决定增删改
- `instantiate`：首次把虚拟节点转成真实 DOM
- `useState`：在函数组件实例上按调用顺序存 hooks
- `reconcileChildrenByKey`：优先按 key 复用，再处理无 key 节点，最后做 DOM 重排

## 为什么这版值得学

这版故意省略了 Fiber、并发调度、effect、context、错误边界等复杂层，但保留了 React 最核心的三个思想：

- UI = f(state)
- 组件状态按“实例”存储，不按“函数”存储
- diff 的复用策略决定状态是否保留

## 建议学习路径（从这份代码到 React 源码）

1. 先吃透这里的 `reconcileChildrenByKey`
2. 再看 React 的 child reconciliation：`packages/react-reconciler/src/ReactChildFiber.js`
3. 然后看 Hook：`packages/react-reconciler/src/ReactFiberHooks.js`
4. 最后看调度与更新入口：`ReactFiberWorkLoop*` 和 `ReactFiberBeginWork*`

## 建议你接下来自己扩展

1. 实现 `useEffect`（先只支持 mount + cleanup）
2. 给 DOM 属性更新补上更完整的 style diff
3. 给函数组件加 `useReducer`
4. 把同步递归渲染改成“可中断任务切片”（模拟 Fiber 动机）

---

如果你愿意，我下一步可以直接带你做第一个扩展：`useEffect`，并且保持这份 mini 内核结构不崩。
