"use client"

import * as React from "react"

type ToastVariant = "default" | "success" | "destructive"

interface Toast {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
  open: boolean
}

type ToastInput = Omit<Toast, "id" | "open">

interface ToastState {
  toasts: Toast[]
}

let count = 0
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

const listeners: Array<(state: ToastState) => void> = []
let memoryState: ToastState = { toasts: [] }

function dispatch(action: { type: "ADD" | "DISMISS"; toast?: Toast; toastId?: string }) {
  if (action.type === "ADD" && action.toast) {
    memoryState = { toasts: [action.toast, ...memoryState.toasts].slice(0, 3) }
  } else if (action.type === "DISMISS" && action.toastId) {
    memoryState = {
      toasts: memoryState.toasts.map((t) =>
        t.id === action.toastId ? { ...t, open: false } : t
      ),
    }
    setTimeout(() => {
      memoryState = { toasts: memoryState.toasts.filter((t) => t.id !== action.toastId) }
      listeners.forEach((l) => l(memoryState))
    }, 300)
  }
  listeners.forEach((l) => l(memoryState))
}

export function toast(input: ToastInput) {
  const id = genId()
  const newToast: Toast = { ...input, id, open: true }
  dispatch({ type: "ADD", toast: newToast })
  setTimeout(() => dispatch({ type: "DISMISS", toastId: id }), 4000)
  return id
}

export function useToast() {
  const [state, setState] = React.useState<ToastState>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const idx = listeners.indexOf(setState)
      if (idx > -1) listeners.splice(idx, 1)
    }
  }, [])

  return { toasts: state.toasts }
}
