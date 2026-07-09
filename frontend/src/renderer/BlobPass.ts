import { BLOB_SHADER } from './shaders/blob'
import { Palette, paletteToArray } from './types'

export class BlobPass {
  private device: GPUDevice | null = null
  private pipeline: GPURenderPipeline | null = null
  private bindGroup: GPUBindGroup | null = null
  private uniformBuffer: GPUBuffer | null = null

  async initialize(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device

    const shaderModule = device.createShaderModule({
      label: 'Blob Shader',
      code: BLOB_SHADER,
    })

    this.uniformBuffer = device.createBuffer({
      label: 'Blob Uniforms',
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    const bindGroupLayout = device.createBindGroupLayout({
      label: 'Blob BindGroupLayout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        },
      ],
    })

    this.bindGroup = device.createBindGroup({
      label: 'Blob BindGroup',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
      ],
    })

    const pipelineLayout = device.createPipelineLayout({
      label: 'Blob PipelineLayout',
      bindGroupLayouts: [bindGroupLayout],
    })

    this.pipeline = device.createRenderPipeline({
      label: 'Blob Pipeline',
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
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    })
  }

  updateUniforms(
    time: number,
    width: number,
    height: number,
    palette: Palette,
    _centerX: number,
    _centerY: number,
    radius: number,
    audioBass: number,
    audioMid: number,
    audioTreble: number,
    audioEnergy: number,
  ) {
    if (!this.uniformBuffer || !this.device) return

    const paletteArr = paletteToArray(palette)
    const data = new ArrayBuffer(256)
    const view = new DataView(data)
    let offset = 0

    // time: f32
    view.setFloat32(offset, time, true); offset += 4
    // audioBass: f32
    view.setFloat32(offset, audioBass, true); offset += 4
    // audioMid: f32
    view.setFloat32(offset, audioMid, true); offset += 4
    // audioTreble: f32
    view.setFloat32(offset, audioTreble, true); offset += 4
    // resolution: vec2<f32>
    view.setFloat32(offset, width, true); offset += 4
    view.setFloat32(offset, height, true); offset += 4
    // audioEnergy: f32
    view.setFloat32(offset, audioEnergy, true); offset += 4
    // blobRadius: f32
    view.setFloat32(offset, radius, true); offset += 4
    // blobIntensity: f32
    view.setFloat32(offset, 1.0, true); offset += 4
    // palette: array<vec3<f32>, 6> — each vec3 at 16-byte boundary
    offset = 64 // align to 64 for palette start
    for (let i = 0; i < 6; i++) {
      const j = i * 3
      view.setFloat32(offset, paletteArr[j], true); offset += 4
      view.setFloat32(offset, paletteArr[j + 1], true); offset += 4
      view.setFloat32(offset, paletteArr[j + 2], true); offset += 4
      offset += 4 // 16-byte alignment padding
    }

    this.device.queue.writeBuffer(this.uniformBuffer, 0, data)
  }

  render(passEncoder: GPURenderPassEncoder) {
    if (!this.pipeline || !this.bindGroup) return
    passEncoder.setPipeline(this.pipeline)
    passEncoder.setBindGroup(0, this.bindGroup)
    passEncoder.draw(6)
  }

  destroy() {
    this.uniformBuffer?.destroy()
    this.uniformBuffer = null
    this.pipeline = null
    this.bindGroup = null
    this.device = null
  }
}
