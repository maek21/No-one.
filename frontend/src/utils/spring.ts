export class Spring {
  current: number
  target: number
  velocity: number
  stiffness: number
  damping: number

  constructor(initialValue = 0, stiffness = 0.15, damping = 0.25) {
    this.current = initialValue
    this.target = initialValue
    this.velocity = 0
    this.stiffness = stiffness
    this.damping = damping
  }

  setValue(target: number): void {
    this.target = target
  }

  update(): number {
    const delta = this.target - this.current
    const acceleration = delta * this.stiffness
    this.velocity += acceleration
    this.velocity *= 1 - this.damping
    this.current += this.velocity
    return this.current
  }

  getValue(): number {
    return this.current
  }

  isAtTarget(tolerance = 0.01): boolean {
    return Math.abs(this.current - this.target) < tolerance
  }
}

export class Vector2Spring {
  x: Spring
  y: Spring

  constructor(initialX = 0, initialY = 0, stiffness = 0.15, damping = 0.25) {
    this.x = new Spring(initialX, stiffness, damping)
    this.y = new Spring(initialY, stiffness, damping)
  }

  setTarget(x: number, y: number): void {
    this.x.setValue(x)
    this.y.setValue(y)
  }

  update(): { x: number; y: number } {
    return { x: this.x.update(), y: this.y.update() }
  }

  getValue(): { x: number; y: number } {
    return { x: this.x.getValue(), y: this.y.getValue() }
  }

  isAtTarget(): boolean {
    return this.x.isAtTarget() && this.y.isAtTarget()
  }
}
