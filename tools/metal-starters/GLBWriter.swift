import Foundation
import Metal
import simd

private struct MTLPart {
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

  init(part: StarterPart, vertexOffset: UInt32) {
    centerX = part.center.x
    centerY = part.center.y
    centerZ = part.center.z
    radiusX = part.radius.x
    radiusY = part.radius.y
    radiusZ = part.radius.z
    rotationX = part.rotation.x
    rotationY = part.rotation.y
    rotationZ = part.rotation.z
    rings = part.rings
    segments = part.segments
    self.vertexOffset = vertexOffset
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

private func starterError(_ code: Int, _ message: String) -> NSError {
  NSError(
    domain: "MetalStarters",
    code: code,
    userInfo: [NSLocalizedDescriptionKey: message]
  )
}

private func vertexCount(for part: StarterPart) throws -> Int {
  guard part.rings > 0, part.segments > 2 else {
    throw starterError(10, "Part \(part.name) has invalid tessellation")
  }
  let count = (UInt64(part.rings) + 1) * (UInt64(part.segments) + 1)
  guard count <= UInt64(Int.max) else {
    throw starterError(11, "Part \(part.name) has too many vertices")
  }
  return Int(count)
}

private func validate(character: StarterCharacter) throws -> Int {
  guard !character.parts.isEmpty else {
    throw starterError(12, "Character \(character.id) has no parts")
  }
  guard !character.materials.isEmpty else {
    throw starterError(13, "Character \(character.id) has no materials")
  }

  var total = 0
  for part in character.parts {
    let values = [
      part.center.x, part.center.y, part.center.z,
      part.radius.x, part.radius.y, part.radius.z,
      part.rotation.x, part.rotation.y, part.rotation.z,
    ]
    guard values.allSatisfy(\.isFinite),
          part.radius.x > 0, part.radius.y > 0, part.radius.z > 0 else {
      throw starterError(14, "Part \(part.name) has invalid geometry")
    }
    guard character.materials.indices.contains(part.material) else {
      throw starterError(15, "Part \(part.name) has an invalid material index")
    }
    let count = try vertexCount(for: part)
    guard total <= Int(UInt32.max) - count else {
      throw starterError(16, "Character \(character.id) exceeds the Metal vertex limit")
    }
    total += count
  }
  return total
}

func generateVertices(character: StarterCharacter, libraryURL: URL) throws -> [Vertex] {
  guard MemoryLayout<MTLPart>.stride == 48, MemoryLayout<Vertex>.stride == 24 else {
    throw starterError(20, "Swift layouts do not match the Metal packed ABI")
  }
  let totalVertexCount = try validate(character: character)
  guard let device = MTLCreateSystemDefaultDevice() else {
    throw starterError(21, "No default Metal device is available")
  }
  guard let commandQueue = device.makeCommandQueue() else {
    throw starterError(22, "Could not create a Metal command queue")
  }
  let library = try device.makeLibrary(URL: libraryURL)
  guard let function = library.makeFunction(name: "generateStarterVertices") else {
    throw starterError(23, "generateStarterVertices is missing from the Metal library")
  }
  let pipeline = try device.makeComputePipelineState(function: function)

  var vertexOffset: UInt32 = 0
  var metalParts: [MTLPart] = []
  metalParts.reserveCapacity(character.parts.count)
  for part in character.parts {
    metalParts.append(MTLPart(part: part, vertexOffset: vertexOffset))
    vertexOffset += UInt32(try vertexCount(for: part))
  }

  guard let partsBuffer = device.makeBuffer(
          bytes: metalParts,
          length: MemoryLayout<MTLPart>.stride * metalParts.count,
          options: .storageModeShared
        ),
        let verticesBuffer = device.makeBuffer(
          length: MemoryLayout<Vertex>.stride * totalVertexCount,
          options: .storageModeShared
        ),
        let commandBuffer = commandQueue.makeCommandBuffer(),
        let encoder = commandBuffer.makeComputeCommandEncoder() else {
    throw starterError(24, "Could not allocate Metal generation resources")
  }

  var partCount = UInt32(metalParts.count)
  encoder.setComputePipelineState(pipeline)
  encoder.setBuffer(partsBuffer, offset: 0, index: 0)
  encoder.setBuffer(verticesBuffer, offset: 0, index: 1)
  encoder.setBytes(&partCount, length: MemoryLayout<UInt32>.stride, index: 2)
  let threadsPerGroup = MTLSize(
    width: min(pipeline.maxTotalThreadsPerThreadgroup, 256),
    height: 1,
    depth: 1
  )
  encoder.dispatchThreads(
    MTLSize(width: totalVertexCount, height: 1, depth: 1),
    threadsPerThreadgroup: threadsPerGroup
  )
  encoder.endEncoding()
  commandBuffer.commit()
  commandBuffer.waitUntilCompleted()
  if commandBuffer.status == .error {
    throw commandBuffer.error ?? starterError(25, "Metal command buffer failed")
  }

  let pointer = verticesBuffer.contents().bindMemory(
    to: Vertex.self,
    capacity: totalVertexCount
  )
  let vertices = Array(UnsafeBufferPointer(start: pointer, count: totalVertexCount))
  for vertex in vertices {
    let values = [
      vertex.positionX, vertex.positionY, vertex.positionZ,
      vertex.normalX, vertex.normalY, vertex.normalZ,
    ]
    guard values.allSatisfy(\.isFinite) else {
      throw starterError(26, "Metal generated a non-finite vertex or normal")
    }
  }
  return vertices
}

private func triangleIndices(rings: Int, segments: Int) -> [UInt32] {
  var indices: [UInt32] = []
  indices.reserveCapacity(rings * segments * 6)
  let columns = segments + 1
  for ring in 0..<rings {
    for segment in 0..<segments {
      let topLeft = UInt32(ring * columns + segment)
      let topRight = topLeft + 1
      let bottomLeft = UInt32((ring + 1) * columns + segment)
      let bottomRight = bottomLeft + 1
      indices += [
        topLeft, topRight, bottomLeft,
        topRight, bottomRight, bottomLeft,
      ]
    }
  }
  return indices
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

private func writeAtomically(_ data: Data, to outputURL: URL) throws {
  try FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(),
    withIntermediateDirectories: true
  )
  try data.write(to: outputURL, options: .atomic)
}

func writeGLB(
  character: StarterCharacter,
  vertices: [Vertex],
  outputURL: URL
) throws -> GeneratedBounds {
  let expectedVertexCount = try validate(character: character)
  guard vertices.count == expectedVertexCount else {
    throw starterError(30, "Unexpected vertex count for \(character.id)")
  }

  var bin = Data()
  var bufferViews: [[String: Any]] = []
  var accessors: [[String: Any]] = []
  var meshes: [[String: Any]] = []
  var nodes: [[String: Any]] = []
  var vertexOffset = 0
  var overallMinimum = SIMD3<Float>(repeating: Float.greatestFiniteMagnitude)
  var overallMaximum = SIMD3<Float>(repeating: -Float.greatestFiniteMagnitude)

  for part in character.parts {
    let count = try vertexCount(for: part)
    let partVertices = vertices[vertexOffset..<(vertexOffset + count)]
    padToFourBytes(&bin, fill: 0)
    let vertexByteOffset = bin.count
    var minimum = SIMD3<Float>(repeating: Float.greatestFiniteMagnitude)
    var maximum = SIMD3<Float>(repeating: -Float.greatestFiniteMagnitude)

    for vertex in partVertices {
      let values = [
        vertex.positionX, vertex.positionY, vertex.positionZ,
        vertex.normalX, vertex.normalY, vertex.normalZ,
      ]
      guard values.allSatisfy(\.isFinite) else {
        throw starterError(31, "Cannot write a non-finite vertex or normal")
      }
      append(vertex.positionX, to: &bin)
      append(vertex.positionY, to: &bin)
      append(vertex.positionZ, to: &bin)
      append(vertex.normalX, to: &bin)
      append(vertex.normalY, to: &bin)
      append(vertex.normalZ, to: &bin)
      minimum = simd.min(minimum, vertex.position)
      maximum = simd.max(maximum, vertex.position)
    }
    overallMinimum = simd.min(overallMinimum, minimum)
    overallMaximum = simd.max(overallMaximum, maximum)

    let vertexView = bufferViews.count
    bufferViews.append([
      "buffer": 0,
      "byteOffset": vertexByteOffset,
      "byteLength": count * MemoryLayout<Vertex>.stride,
      "byteStride": MemoryLayout<Vertex>.stride,
      "target": 34962,
    ])
    let positionAccessor = accessors.count
    accessors.append([
      "bufferView": vertexView,
      "byteOffset": 0,
      "componentType": 5126,
      "count": count,
      "type": "VEC3",
      "min": [minimum.x, minimum.y, minimum.z],
      "max": [maximum.x, maximum.y, maximum.z],
    ])
    let normalAccessor = accessors.count
    accessors.append([
      "bufferView": vertexView,
      "byteOffset": 12,
      "componentType": 5126,
      "count": count,
      "type": "VEC3",
    ])

    let indices = triangleIndices(rings: Int(part.rings), segments: Int(part.segments))
    guard indices.allSatisfy({ Int($0) < count }) else {
      throw starterError(32, "Part \(part.name) generated an out-of-range index")
    }
    padToFourBytes(&bin, fill: 0)
    let indexByteOffset = bin.count
    for index in indices { appendUInt32(index, to: &bin) }
    let indexView = bufferViews.count
    bufferViews.append([
      "buffer": 0,
      "byteOffset": indexByteOffset,
      "byteLength": indices.count * MemoryLayout<UInt32>.stride,
      "target": 34963,
    ])
    let indexAccessor = accessors.count
    accessors.append([
      "bufferView": indexView,
      "byteOffset": 0,
      "componentType": 5125,
      "count": indices.count,
      "type": "SCALAR",
    ])

    let meshIndex = meshes.count
    let primitive: [String: Any] = [
      "attributes": ["POSITION": positionAccessor, "NORMAL": normalAccessor],
      "indices": indexAccessor,
      "material": part.material,
      "mode": 4,
    ]
    meshes.append(["name": part.name, "primitives": [primitive]])
    nodes.append(["name": part.name, "mesh": meshIndex])
    vertexOffset += count
  }
  padToFourBytes(&bin, fill: 0)

  let materials: [[String: Any]] = character.materials.map { material in
    [
      "name": material.name,
      "pbrMetallicRoughness": [
        "baseColorFactor": [
          material.color.x, material.color.y, material.color.z, material.color.w,
        ],
        "metallicFactor": material.metallic,
        "roughnessFactor": material.roughness,
      ],
    ]
  }
  let document: [String: Any] = [
    "asset": ["version": "2.0", "generator": "lingplay-metal-starters"],
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

  let totalLength = 12 + 8 + json.count + 8 + bin.count
  guard totalLength <= Int(UInt32.max) else {
    throw starterError(33, "Generated GLB is too large")
  }
  var glb = Data()
  glb.append("glTF".data(using: .ascii)!)
  appendUInt32(2, to: &glb)
  appendUInt32(UInt32(totalLength), to: &glb)
  appendUInt32(UInt32(json.count), to: &glb)
  glb.append("JSON".data(using: .ascii)!)
  glb.append(json)
  appendUInt32(UInt32(bin.count), to: &glb)
  glb.append(Data([0x42, 0x49, 0x4e, 0x00]))
  glb.append(bin)
  try writeAtomically(glb, to: outputURL)

  return GeneratedBounds(
    min: [overallMinimum.x, overallMinimum.y, overallMinimum.z],
    max: [overallMaximum.x, overallMaximum.y, overallMaximum.z]
  )
}

func writeMetadata(
  results: [(StarterCharacter, GeneratedBounds)],
  outputURL: URL
) throws {
  var metadata: [String: Any] = [:]
  for (character, bounds) in results {
    guard bounds.min.count == 3, bounds.max.count == 3,
          (bounds.min + bounds.max).allSatisfy(\.isFinite) else {
      throw starterError(40, "Cannot write invalid bounds for \(character.id)")
    }
    metadata[character.id] = [
      "model_url": "/models/starters/\(character.id).glb",
      "size": character.defaultSize,
      "model_bounds": [
        "min": ["x": bounds.min[0], "y": bounds.min[1], "z": bounds.min[2]],
        "max": ["x": bounds.max[0], "y": bounds.max[1], "z": bounds.max[2]],
      ],
      "model_origin_offset": [
        "x": -(bounds.min[0] + bounds.max[0]) / 2,
        "y": -bounds.min[1],
        "z": -(bounds.min[2] + bounds.max[2]) / 2,
      ],
    ]
  }
  let json = try JSONSerialization.data(
    withJSONObject: metadata,
    options: [.prettyPrinted, .sortedKeys]
  )
  var data = Data("export const STARTER_MODEL_METADATA = ".utf8)
  data.append(json)
  data.append(Data(" as const;\n".utf8))
  try writeAtomically(data, to: outputURL)
}
