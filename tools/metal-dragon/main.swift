import Foundation
import Metal
import simd

struct DragonPart {
  let name: String
  let center: SIMD3<Float>
  let radius: SIMD3<Float>
  let rotation: SIMD3<Float>
  let rings: UInt32
  let segments: UInt32
  let material: Int
}

struct MTLPart {
  var centerX: Float
  var centerY: Float
  var centerZ: Float
  var radiusX: Float
  var radiusY: Float
  var radiusZ: Float
  var rotationX: Float
  var rotationY: Float
  var rotationZ: Float
  var rings: UInt32
  var segments: UInt32
  var vertexOffset: UInt32

  init(part: DragonPart, vertexOffset: UInt32) {
    centerX = part.center.x; centerY = part.center.y; centerZ = part.center.z
    radiusX = part.radius.x; radiusY = part.radius.y; radiusZ = part.radius.z
    rotationX = part.rotation.x; rotationY = part.rotation.y; rotationZ = part.rotation.z
    rings = part.rings; segments = part.segments; self.vertexOffset = vertexOffset
  }
}

struct Vertex {
  var positionX: Float
  var positionY: Float
  var positionZ: Float
  var normalX: Float
  var normalY: Float
  var normalZ: Float

  var position: SIMD3<Float> { SIMD3(positionX, positionY, positionZ) }
  var normal: SIMD3<Float> { SIMD3(normalX, normalY, normalZ) }
}

private let pi = Float.pi

func makeDragonParts() -> [DragonPart] {
  [
    DragonPart(name: "Torso", center: SIMD3(0, 0, 0), radius: SIMD3(1.55, 0.82, 0.92), rotation: SIMD3(0, 0, 0), rings: 16, segments: 24, material: 0),
    DragonPart(name: "Neck", center: SIMD3(1.12, 0.68, 0), radius: SIMD3(0.48, 0.76, 0.48), rotation: SIMD3(0, 0, -0.48), rings: 12, segments: 20, material: 0),
    DragonPart(name: "Head", center: SIMD3(1.72, 1.28, 0), radius: SIMD3(0.72, 0.54, 0.58), rotation: SIMD3(0, 0, 0.08), rings: 12, segments: 20, material: 0),
    DragonPart(name: "Snout", center: SIMD3(2.28, 1.17, 0), radius: SIMD3(0.54, 0.30, 0.42), rotation: SIMD3(0, 0, 0), rings: 10, segments: 16, material: 0),
    DragonPart(name: "HornLeft", center: SIMD3(1.54, 1.86, 0.36), radius: SIMD3(0.12, 0.55, 0.12), rotation: SIMD3(0.22, 0, -0.36), rings: 6, segments: 10, material: 1),
    DragonPart(name: "HornRight", center: SIMD3(1.54, 1.86, -0.36), radius: SIMD3(0.12, 0.55, 0.12), rotation: SIMD3(-0.22, 0, -0.36), rings: 6, segments: 10, material: 1),
    DragonPart(name: "WingLeft", center: SIMD3(-0.22, 0.62, 1.12), radius: SIMD3(1.62, 0.13, 0.72), rotation: SIMD3(-0.20, -0.35, 0.15), rings: 12, segments: 20, material: 2),
    DragonPart(name: "WingRight", center: SIMD3(-0.22, 0.62, -1.12), radius: SIMD3(1.62, 0.13, 0.72), rotation: SIMD3(0.20, 0.35, 0.15), rings: 12, segments: 20, material: 2),
    DragonPart(name: "LegFrontLeft", center: SIMD3(0.82, -0.98, 0.58), radius: SIMD3(0.28, 0.86, 0.28), rotation: SIMD3(0, 0, 0.10), rings: 10, segments: 16, material: 0),
    DragonPart(name: "LegFrontRight", center: SIMD3(0.82, -0.98, -0.58), radius: SIMD3(0.28, 0.86, 0.28), rotation: SIMD3(0, 0, -0.10), rings: 10, segments: 16, material: 0),
    DragonPart(name: "LegBackLeft", center: SIMD3(-0.90, -0.92, 0.61), radius: SIMD3(0.34, 0.92, 0.34), rotation: SIMD3(0, 0, -0.12), rings: 10, segments: 16, material: 0),
    DragonPart(name: "LegBackRight", center: SIMD3(-0.90, -0.92, -0.61), radius: SIMD3(0.34, 0.92, 0.34), rotation: SIMD3(0, 0, 0.12), rings: 10, segments: 16, material: 0),
    DragonPart(name: "TailBase", center: SIMD3(-1.67, 0, 0), radius: SIMD3(0.72, 0.42, 0.42), rotation: SIMD3(0, 0, -0.38), rings: 8, segments: 14, material: 0),
    DragonPart(name: "TailMiddle", center: SIMD3(-2.26, -0.30, 0), radius: SIMD3(0.54, 0.29, 0.29), rotation: SIMD3(0, 0, -0.43), rings: 7, segments: 12, material: 0),
    DragonPart(name: "TailTip", center: SIMD3(-2.68, -0.63, 0), radius: SIMD3(0.35, 0.17, 0.17), rotation: SIMD3(0, 0, -0.56), rings: 6, segments: 10, material: 0),
  ]
}

func makeTriangleIndices(rings: Int, segments: Int, baseVertex: UInt32) -> [UInt32] {
  var indices: [UInt32] = []
  indices.reserveCapacity(rings * segments * 6)
  let columns = segments + 1
  for ring in 0..<rings {
    for segment in 0..<segments {
      let topLeft = baseVertex + UInt32(ring * columns + segment)
      let topRight = topLeft + 1
      let bottomLeft = baseVertex + UInt32((ring + 1) * columns + segment)
      let bottomRight = bottomLeft + 1
      indices += [topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight]
    }
  }
  return indices
}

func generateVertices(parts: [DragonPart], libraryURL: URL) throws -> [Vertex] {
  guard MemoryLayout<MTLPart>.stride == 48, MemoryLayout<Vertex>.stride == 24 else {
    throw NSError(domain: "MetalDragon", code: 0, userInfo: [NSLocalizedDescriptionKey: "Swift vertex layouts do not match the Metal packed layouts"])
  }
  guard let device = MTLCreateSystemDefaultDevice() else {
    throw NSError(domain: "MetalDragon", code: 1, userInfo: [NSLocalizedDescriptionKey: "No default Metal device is available"])
  }
  guard let commandQueue = device.makeCommandQueue() else {
    throw NSError(domain: "MetalDragon", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not create a Metal command queue"])
  }
  let library = try device.makeLibrary(URL: libraryURL)
  guard let function = library.makeFunction(name: "generateDragonVertices") else {
    throw NSError(domain: "MetalDragon", code: 3, userInfo: [NSLocalizedDescriptionKey: "generateDragonVertices is missing from the Metal library"])
  }
  let pipeline = try device.makeComputePipelineState(function: function)

  var offset: UInt32 = 0
  let metalParts = parts.map { part -> MTLPart in
    defer { offset += (part.rings + 1) * (part.segments + 1) }
    return MTLPart(part: part, vertexOffset: offset)
  }
  let vertexCount = Int(offset)
  guard let partsBuffer = device.makeBuffer(bytes: metalParts, length: MemoryLayout<MTLPart>.stride * metalParts.count, options: .storageModeShared),
        let verticesBuffer = device.makeBuffer(length: MemoryLayout<Vertex>.stride * vertexCount, options: .storageModeShared),
        let commandBuffer = commandQueue.makeCommandBuffer(),
        let encoder = commandBuffer.makeComputeCommandEncoder() else {
    throw NSError(domain: "MetalDragon", code: 4, userInfo: [NSLocalizedDescriptionKey: "Could not allocate Metal generation resources"])
  }
  var partCount = UInt32(parts.count)
  encoder.setComputePipelineState(pipeline)
  encoder.setBuffer(partsBuffer, offset: 0, index: 0)
  encoder.setBuffer(verticesBuffer, offset: 0, index: 1)
  encoder.setBytes(&partCount, length: MemoryLayout<UInt32>.stride, index: 2)
  let threadsPerGroup = MTLSize(width: min(pipeline.maxTotalThreadsPerThreadgroup, 256), height: 1, depth: 1)
  encoder.dispatchThreads(MTLSize(width: vertexCount, height: 1, depth: 1), threadsPerThreadgroup: threadsPerGroup)
  encoder.endEncoding()
  commandBuffer.commit()
  commandBuffer.waitUntilCompleted()
  if commandBuffer.status == .error {
    throw commandBuffer.error ?? NSError(domain: "MetalDragon", code: 5, userInfo: [NSLocalizedDescriptionKey: "Metal command buffer failed"])
  }

  let pointer = verticesBuffer.contents().bindMemory(to: Vertex.self, capacity: vertexCount)
  let vertices = Array(UnsafeBufferPointer(start: pointer, count: vertexCount))
  for vertex in vertices {
    let values = [vertex.positionX, vertex.positionY, vertex.positionZ, vertex.normalX, vertex.normalY, vertex.normalZ]
    guard values.allSatisfy({ $0.isFinite }) else {
      throw NSError(domain: "MetalDragon", code: 6, userInfo: [NSLocalizedDescriptionKey: "Metal generated a non-finite vertex"])
    }
  }
  return vertices
}

private func append<T>(_ value: T, to data: inout Data) {
  var value = value
  withUnsafeBytes(of: &value) { data.append(contentsOf: $0) }
}

private func appendUInt32(_ value: UInt32, to data: inout Data) {
  append(value.littleEndian, to: &data)
}

private func padToFourBytes(_ data: inout Data, fill: UInt8) {
  while data.count % 4 != 0 { data.append(fill) }
}

func writeGLB(parts: [DragonPart], vertices: [Vertex], outputURL: URL) throws {
  var bin = Data()
  var bufferViews: [[String: Any]] = []
  var accessors: [[String: Any]] = []
  var meshes: [[String: Any]] = []
  var nodes: [[String: Any]] = []
  var vertexOffset = 0

  for part in parts {
    let vertexCount = Int((part.rings + 1) * (part.segments + 1))
    let partVertices = vertices[vertexOffset..<(vertexOffset + vertexCount)]
    padToFourBytes(&bin, fill: 0)
    let vertexByteOffset = bin.count
    var minimum = SIMD3<Float>(repeating: Float.greatestFiniteMagnitude)
    var maximum = SIMD3<Float>(repeating: -Float.greatestFiniteMagnitude)
    for vertex in partVertices {
      append(vertex.positionX, to: &bin); append(vertex.positionY, to: &bin); append(vertex.positionZ, to: &bin)
      append(vertex.normalX, to: &bin); append(vertex.normalY, to: &bin); append(vertex.normalZ, to: &bin)
      minimum = simd.min(minimum, vertex.position)
      maximum = simd.max(maximum, vertex.position)
    }
    let vertexView = bufferViews.count
    bufferViews.append(["buffer": 0, "byteOffset": vertexByteOffset, "byteLength": vertexCount * MemoryLayout<Vertex>.stride, "byteStride": MemoryLayout<Vertex>.stride, "target": 34962])
    let positionAccessor = accessors.count
    accessors.append(["bufferView": vertexView, "byteOffset": 0, "componentType": 5126, "count": vertexCount, "type": "VEC3", "min": [minimum.x, minimum.y, minimum.z], "max": [maximum.x, maximum.y, maximum.z]])
    let normalAccessor = accessors.count
    accessors.append(["bufferView": vertexView, "byteOffset": 12, "componentType": 5126, "count": vertexCount, "type": "VEC3"])

    let indices = makeTriangleIndices(rings: Int(part.rings), segments: Int(part.segments), baseVertex: 0)
    padToFourBytes(&bin, fill: 0)
    let indexByteOffset = bin.count
    for index in indices { appendUInt32(index, to: &bin) }
    let indexView = bufferViews.count
    bufferViews.append(["buffer": 0, "byteOffset": indexByteOffset, "byteLength": indices.count * MemoryLayout<UInt32>.stride, "target": 34963])
    let indexAccessor = accessors.count
    accessors.append(["bufferView": indexView, "componentType": 5125, "count": indices.count, "type": "SCALAR"])

    let meshIndex = meshes.count
    meshes.append(["name": part.name, "primitives": [["attributes": ["POSITION": positionAccessor, "NORMAL": normalAccessor], "indices": indexAccessor, "material": part.material, "mode": 4]]])
    nodes.append(["name": part.name, "mesh": meshIndex])
    vertexOffset += vertexCount
  }
  padToFourBytes(&bin, fill: 0)

  let materials: [[String: Any]] = [
    ["name": "Dragon Red Metal", "pbrMetallicRoughness": ["baseColorFactor": [0.55, 0.012, 0.018, 1], "metallicFactor": 0.82, "roughnessFactor": 0.24]],
    ["name": "Dark Horn", "pbrMetallicRoughness": ["baseColorFactor": [0.055, 0.018, 0.022, 1], "metallicFactor": 0.58, "roughnessFactor": 0.3]],
    ["name": "Dark Wing", "pbrMetallicRoughness": ["baseColorFactor": [0.19, 0.012, 0.02, 1], "metallicFactor": 0.35, "roughnessFactor": 0.42]],
  ]
  let document: [String: Any] = [
    "asset": ["version": "2.0", "generator": "lingplay-metal-dragon"],
    "scene": 0,
    "scenes": [["nodes": Array(0..<nodes.count)]],
    "nodes": nodes,
    "meshes": meshes,
    "materials": materials,
    "buffers": [["byteLength": bin.count]],
    "bufferViews": bufferViews,
    "accessors": accessors,
  ]
  var json = try JSONSerialization.data(withJSONObject: document, options: [.sortedKeys])
  padToFourBytes(&json, fill: 0x20)

  var glb = Data()
  let totalLength = UInt32(12 + 8 + json.count + 8 + bin.count)
  glb.append("glTF".data(using: .ascii)!)
  appendUInt32(2, to: &glb)
  appendUInt32(totalLength, to: &glb)
  appendUInt32(UInt32(json.count), to: &glb)
  glb.append("JSON".data(using: .ascii)!)
  glb.append(json)
  appendUInt32(UInt32(bin.count), to: &glb)
  glb.append(Data([0x42, 0x49, 0x4e, 0x00]))
  glb.append(bin)
  try FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
  try glb.write(to: outputURL, options: .atomic)
  let triangleCount = parts.reduce(0) { $0 + Int($1.rings * $1.segments * 2) }
  print("Generated \(vertices.count) vertices and \(triangleCount) triangles at \(outputURL.path)")
}

func parseArguments() throws -> (library: URL, output: URL) {
  let arguments = Array(CommandLine.arguments.dropFirst())
  guard arguments.count == 4, arguments[0] == "--library", arguments[2] == "--output" else {
    throw NSError(domain: "MetalDragon", code: 7, userInfo: [NSLocalizedDescriptionKey: "Usage: metal-dragon --library <path> --output <path>"])
  }
  return (URL(fileURLWithPath: arguments[1]), URL(fileURLWithPath: arguments[3]))
}

do {
  let arguments = try parseArguments()
  let parts = makeDragonParts()
  let vertices = try generateVertices(parts: parts, libraryURL: arguments.library)
  try writeGLB(parts: parts, vertices: vertices, outputURL: arguments.output)
} catch {
  fputs("Metal dragon generation failed: \(error.localizedDescription)\n", stderr)
  exit(1)
}
