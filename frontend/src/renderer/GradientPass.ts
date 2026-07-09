import { GRADIENT_SHADER } from './shaders/gradient'
import { Palette, paletteToArray } from './types'

export class GradientPass {
  private device: GPUDevice | null = null
  private pipeline: GPURenderPipeline | null = null
  private bindGroup: GPUBindGroup | null = null
  private uniformBuffer: GPUBuffer | null = null

  async initialize(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device

    const shaderModule = device.createShaderModule({
      label: 'Gradient Shader',
      code: GRADIENT_SHADER,
    })

    // Uniform buffer (256 bytes for safety)
    this.uniformBuffer = device.createBuffer({
      label: 'Gradient Uniforms',
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    const bindGroupLayout = device.createBindGroupLayout({
      label: 'Gradient BindGroupLayout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        },
      ],
    })

    this.bindGroup = device.createBindGroup({
      label: 'Gradient BindGroup',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
      ],
    })

    const pipelineLayout = device.createPipelineLayout({
      label: 'Gradient PipelineLayout',
      bindGroupLayouts: [bindGroupLayout],
    })

    this.pipeline = device.createRenderPipeline({
      label: 'Gradient Pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs',
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
            },
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    })
  }

  updateUniforms(time: number, width: number, height: number, palette: Palette) {
    if (!this.uniformBuffer || !this.device) return

    const paletteArr = paletteToArray(palette)
    const data = new ArrayBuffer(256)
    const view = new DataView(data)
    let offset = 0

    // time: f32 (offset 0)
    view.setFloat32(offset, time, true); offset += 4
    // padding 12 bytes (align to 16)
    offset += 12
    // resolution: vec2<f32> (offset 16)
    view.setFloat32(offset, width, true); offset += 4
    view.setFloat32(offset, height, true); offset += 4
    // padding 8 bytes (align to 32)
    offset += 8
    // palette: array<vec3<f32>, 6> — each vec3 starts at 16-byte boundary
    for (let i = 0; i < 6; i++) {
      const j = i * 3
      view.setFloat32(offset, paletteArr[j], true); offset += 4
      view.setFloat32(offset, paletteArr[j + 1], true); offset += 4
      view.setFloat32(offset, paletteArr[j + 2], true); offset += 4
      offset += 4 // padding to 16 bytes
    }

    this.device.queue.writeBuffer(this.uniformBuffer, 0, data)
  }

  render(passEncoder: GPURenderPassEncoder) {
    if (!this.pipeline || !this.bindGroup) return
    passEncoder.setPipeline(this.pipeline)
    passEncoder.setBindGroup(0, this.bindGroup)
    passEncoder.draw(6) // Two triangles
  }

  destroy() {
    this.uniformBuffer?.destroy()
    this.uniformBuffer = null
    this.pipeline = null
    this.bindGroup = null
    this.device = null
  }
}
