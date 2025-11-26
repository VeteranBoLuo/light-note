// directives/v-draggable.ts
import type { Directive } from 'vue'

type DraggableElement = HTMLElement & {
  _cleanup?: () => void
}

const vDraggable: Directive = {
  mounted(el: DraggableElement, binding) {
    let startX = 0
    let startY = 0
    let initialX = 0
    let initialY = 0
    let isDragging = false

    // 设置初始样式
    el.style.position = 'fixed'
    el.style.cursor = 'move'
    el.style.zIndex = '1000'
    
    // 默认右下角位置
    const { offset = 20 } = binding.value || {}
    initialX = window.innerWidth - el.offsetWidth - offset
    initialY = window.innerHeight - el.offsetHeight - offset
    
    el.style.right = `${offset}px`
    el.style.bottom = `${offset}px`

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault()
      isDragging = true
      
      startX = e.clientX
      startY = e.clientY
      initialX = parseInt(getComputedStyle(el).right) || 0
      initialY = parseInt(getComputedStyle(el).bottom) || 0

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return
      
      const deltaX = startX - e.clientX
      const deltaY = startY - e.clientY
      
      const newRight = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, initialX + deltaX))
      const newBottom = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, initialY + deltaY))
      
      el.style.right = `${newRight}px`
      el.style.bottom = `${newBottom}px`
    }

    const onMouseUp = () => {
      isDragging = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    el.addEventListener('mousedown', onMouseDown)
    
    // 清理函数
    el._cleanup = () => {
      el.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  },
  
  unmounted(el: DraggableElement) {
    el._cleanup?.()
  }
}

export default vDraggable