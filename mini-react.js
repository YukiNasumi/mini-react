const TEXT_ELEMENT = "TEXT_ELEMENT";

function createTextElement(value) {
  return {
    type: TEXT_ELEMENT,
    key: null,
    props: {
      nodeValue: String(value),
      children: [],
    },
  };
}

export function createElement(type, config, ...childrenArgs) {
  const props = { ...(config || {}) };
  const key = props.key ?? null;
  delete props.key;

  const flatChildren = childrenArgs.flat();
  props.children = flatChildren
    .filter((child) => child !== null && child !== undefined && child !== false && child !== true)
    .map((child) => (typeof child === "object" ? child : createTextElement(child)));

  return { type, key, props };
}

const roots = new Map();
let currentFunctionInstance = null;

export function render(element, container) {
  const root = roots.get(container) || { element: null, instance: null };
  const nextInstance = reconcile(container, root.instance, element, container);
  roots.set(container, { element, instance: nextInstance });
}

function rerender(container) {
  const root = roots.get(container);
  if (!root) return;
  const nextInstance = reconcile(container, root.instance, root.element, container);
  roots.set(container, { ...root, instance: nextInstance });
}

export function useState(initialValue) {
  if (!currentFunctionInstance) {
    throw new Error("useState can only be called inside a function component.");
  }

  const hooks = currentFunctionInstance.hooks;
  const idx = currentFunctionInstance.hookIndex++;

  if (hooks.length <= idx) {
    hooks.push({
      state: typeof initialValue === "function" ? initialValue() : initialValue,
    });
  }

  const hook = hooks[idx];
  const container = currentFunctionInstance.rootContainer;

  function setState(nextValue) {
    const prev = hook.state;
    const next = typeof nextValue === "function" ? nextValue(prev) : nextValue;
    if (Object.is(prev, next)) return;
    hook.state = next;
    rerender(container);
  }

  return [hook.state, setState];
}

function reconcile(parentDom, instance, element, rootContainer) {
  if (instance == null) {
    if (element == null) return null;
    const newInstance = instantiate(element, rootContainer);
    if (newInstance && newInstance.dom) {
      parentDom.appendChild(newInstance.dom);
    }
    return newInstance;
  }

  if (element == null) {
    if (instance.dom) {
      parentDom.removeChild(instance.dom);
    }
    return null;
  }

  if (instance.element.type !== element.type) {
    const newInstance = instantiate(element, rootContainer);
    if (instance.dom && newInstance && newInstance.dom) {
      parentDom.replaceChild(newInstance.dom, instance.dom);
    } else if (instance.dom && !newInstance?.dom) {
      parentDom.removeChild(instance.dom);
    } else if (!instance.dom && newInstance?.dom) {
      parentDom.appendChild(newInstance.dom);
    }
    return newInstance;
  }

  if (typeof element.type === "function") {
    instance.element = element;
    instance.rootContainer = rootContainer;
    instance.hookIndex = 0;

    const prevInstance = currentFunctionInstance;
    currentFunctionInstance = instance;
    const childElement = element.type(element.props);
    currentFunctionInstance = prevInstance;

    const oldChildInstance = instance.childInstance;
    const childInstance = reconcile(parentDom, oldChildInstance, childElement, rootContainer);

    instance.dom = childInstance ? childInstance.dom : null;
    instance.childInstance = childInstance;
    return instance;
  }

  if (element.type === TEXT_ELEMENT) {
    if (instance.dom.nodeValue !== element.props.nodeValue) {
      instance.dom.nodeValue = element.props.nodeValue;
    }
    instance.element = element;
    return instance;
  }

  updateDomProperties(instance.dom, instance.element.props, element.props);
  instance.childInstances = reconcileChildrenByKey(instance, element, rootContainer);
  instance.element = element;
  return instance;
}

function reconcileChildrenByKey(instance, element, rootContainer) {
  const parentDom = instance.dom;
  const oldChildInstances = instance.childInstances || [];
  const newChildElements = element.props.children || [];

  const oldKeyed = new Map();
  const oldUnkeyed = [];

  for (const oldInstance of oldChildInstances) {
    const oldKey = oldInstance.element.key;
    if (oldKey !== null && oldKey !== undefined) {
      oldKeyed.set(oldKey, oldInstance);
    } else {
      oldUnkeyed.push(oldInstance);
    }
  }

  let unkeyedIndex = 0;
  const nextChildInstances = [];

  for (const childElement of newChildElements) {
    const key = childElement?.key;
    let matchedOld = null;

    if (key !== null && key !== undefined) {
      matchedOld = oldKeyed.get(key) || null;
      if (matchedOld) oldKeyed.delete(key);
    } else {
      matchedOld = oldUnkeyed[unkeyedIndex] || null;
      unkeyedIndex += 1;
    }

    const nextChild = reconcile(parentDom, matchedOld, childElement, rootContainer);
    if (nextChild) nextChildInstances.push(nextChild);
  }

  for (const leftover of oldKeyed.values()) {
    reconcile(parentDom, leftover, null, rootContainer);
  }

  for (let i = unkeyedIndex; i < oldUnkeyed.length; i += 1) {
    reconcile(parentDom, oldUnkeyed[i], null, rootContainer);
  }

  // Keep DOM order aligned with virtual children order.
  for (let i = 0; i < nextChildInstances.length; i += 1) {
    const childDom = nextChildInstances[i].dom;
    if (!childDom) continue;
    const domAtIndex = parentDom.childNodes[i] || null;
    if (childDom !== domAtIndex) {
      parentDom.insertBefore(childDom, domAtIndex);
    }
  }

  return nextChildInstances;
}

function instantiate(element, rootContainer) {
  if (element == null) return null;

  const { type, props } = element;

  if (typeof type === "function") {
    const instance = {
      element,
      dom: null,
      childInstance: null,
      hooks: [],
      hookIndex: 0,
      rootContainer,
    };

    const prevInstance = currentFunctionInstance;
    currentFunctionInstance = instance;
    const childElement = type(props);
    currentFunctionInstance = prevInstance;

    const childInstance = instantiate(childElement, rootContainer);
    instance.dom = childInstance ? childInstance.dom : null;
    instance.childInstance = childInstance;
    return instance;
  }

  if (type === TEXT_ELEMENT) {
    const dom = document.createTextNode(props.nodeValue);
    return {
      element,
      dom,
      childInstances: [],
      rootContainer,
    };
  }

  const dom = document.createElement(type);
  updateDomProperties(dom, {}, props);

  const childElements = props.children || [];
  const childInstances = childElements
    .map((childElement) => instantiate(childElement, rootContainer))
    .filter(Boolean);

  for (const childInstance of childInstances) {
    if (childInstance.dom) dom.appendChild(childInstance.dom);
  }

  return {
    element,
    dom,
    childInstances,
    rootContainer,
  };
}

function updateDomProperties(dom, prevProps, nextProps) {
  const isEvent = (name) => name.startsWith("on");
  const isProperty = (name) => name !== "children" && !isEvent(name);

  for (const name of Object.keys(prevProps)) {
    if (isEvent(name)) {
      const eventType = name.toLowerCase().slice(2);
      const prevHandler = prevProps[name];
      const nextHandler = nextProps[name];
      if (prevHandler && (!nextHandler || prevHandler !== nextHandler)) {
        dom.removeEventListener(eventType, prevHandler);
      }
      continue;
    }

    if (!isProperty(name)) continue;
    if (!(name in nextProps)) {
      removeProperty(dom, name, prevProps[name]);
    }
  }

  for (const name of Object.keys(nextProps)) {
    if (isEvent(name)) {
      const eventType = name.toLowerCase().slice(2);
      const prevHandler = prevProps[name];
      const nextHandler = nextProps[name];
      if (prevHandler !== nextHandler && nextHandler) {
        if (prevHandler) dom.removeEventListener(eventType, prevHandler);
        dom.addEventListener(eventType, nextHandler);
      }
      continue;
    }

    if (!isProperty(name)) continue;
    if (prevProps[name] !== nextProps[name]) {
      setProperty(dom, name, nextProps[name]);
    }
  }
}

function setProperty(dom, name, value) {
  if (name === "className") {
    dom.setAttribute("class", value);
    return;
  }

  if (name === "style" && typeof value === "object" && value !== null) {
    Object.assign(dom.style, value);
    return;
  }

  if (name in dom) {
    dom[name] = value;
    return;
  }

  dom.setAttribute(name, value);
}

function removeProperty(dom, name, oldValue) {
  if (name === "className") {
    dom.removeAttribute("class");
    return;
  }

  if (name === "style" && typeof oldValue === "object" && oldValue !== null) {
    for (const styleName of Object.keys(oldValue)) {
      dom.style[styleName] = "";
    }
    return;
  }

  if (name in dom) {
    dom[name] = "";
    return;
  }

  dom.removeAttribute(name);
}
