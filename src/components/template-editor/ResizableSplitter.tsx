import React, { useRef, useEffect } from "react"
import { ResizableSplitterProps } from "@/types/editor"

export function ResizableSplitter({ onResize }: ResizableSplitterProps) {
  const splitterRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return
      
      const dx = e.clientX - startXRef.current
      const newWidth = Math.max(150, Math.min(400, startWidthRef.current + dx))
      onResize(newWidth)
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      document.body.style.cursor = 'default'
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [onResize])

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = splitterRef.current?.previousElementSibling?.getBoundingClientRect().width || 0
    document.body.style.cursor = 'col-resize'
  }

  return (
    <div
      ref={splitterRef}
      className="w-1 bg-border hover:bg-primary cursor-col-resize"
      onMouseDown={handleMouseDown}
    />
  )
} 