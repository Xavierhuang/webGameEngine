import Foundation
import simd

struct StarterMaterial {
  let name: String
  let color: SIMD4<Float>
  let metallic: Float
  let roughness: Float
}

/// Available part primitives. Must stay in lockstep with ProceduralParts.metal
/// (constants PRIMITIVE_*). Extending: add here + add a `computeX` in the .metal
/// kernel + add the case to the switch in generateStarterVertices.
enum StarterPrimitive: UInt32 {
  case ellipsoid = 0
  case cylinder  = 1   // flat top + straight side + flat bottom, aligned to +Y
  case cone      = 2   // pointy apex at +Y, flat base at -Y
}

struct StarterPart {
  let name: String
  let center: SIMD3<Float>
  let radius: SIMD3<Float>
  let rotation: SIMD3<Float>
  let rings: UInt32
  let segments: UInt32
  let material: Int
  /// Defaults to `.ellipsoid` for backward compatibility with existing catalog
  /// entries — only new callers that want cylinder/cone need to pass this.
  let primitive: StarterPrimitive

  init(
    name: String,
    center: SIMD3<Float>,
    radius: SIMD3<Float>,
    rotation: SIMD3<Float>,
    rings: UInt32,
    segments: UInt32,
    material: Int,
    primitive: StarterPrimitive = .ellipsoid
  ) {
    self.name = name
    self.center = center
    self.radius = radius
    self.rotation = rotation
    self.rings = rings
    self.segments = segments
    self.material = material
    self.primitive = primitive
  }
}

struct StarterCharacter {
  let id: String
  let displayName: String
  let description: String
  let aliases: [String]
  let defaultSize: Float
  let materials: [StarterMaterial]
  let parts: [StarterPart]
}

struct GeneratedBounds: Codable {
  let min: [Float]
  let max: [Float]
}

private func material(_ name: String, _ color: SIMD4<Float>) -> [StarterMaterial] {
  [StarterMaterial(name: name, color: color, metallic: 0.35, roughness: 0.55)]
}

private func body(radius: SIMD3<Float> = SIMD3(0.65, 0.9, 0.5)) -> [StarterPart] {
  [StarterPart(
    name: "Body",
    center: SIMD3(0, 0, 0),
    radius: radius,
    rotation: SIMD3(0, 0, 0),
    rings: 12,
    segments: 18,
    material: 0
  )]
}

/// Optional head accessory for a humanoid — all rendered as ellipsoids since
/// the Metal kernel only produces sphere-parameterized meshes.
enum HumanoidHat {
  case none
  case helmet        // hemispherical cover — knight, astronaut
  case wizardHat     // pointy tall cone-like extrusion
  case crown         // short wide ring atop the head
}

/// Shared humanoid template — head, torso, two arms, two legs (or a robe skirt),
/// with optional hat and cape accessories. Materials are indices into the
/// character's own materials array so each humanoid can pick its own palette
/// while sharing this anatomy. Proportions can be tweaked per character via
/// `bodyScale` (per-axis multiplier), e.g. ninja is slimmer, robot is boxier.
private func humanoid(
  body: Int,
  accent: Int? = nil,
  hat: HumanoidHat = .none,
  cape: Bool = false,
  robe: Bool = false,
  bodyScale: SIMD3<Float> = SIMD3(1, 1, 1)
) -> [StarterPart] {
  let s = bodyScale
  let accentMat = accent ?? body
  var parts: [StarterPart] = []

  parts.append(StarterPart(
    name: "Head",
    center: SIMD3(0, 0.62 * s.y, 0),
    radius: SIMD3(0.24 * s.x, 0.26 * s.y, 0.24 * s.z),
    rotation: SIMD3(0, 0, 0),
    rings: 12, segments: 18, material: body
  ))
  parts.append(StarterPart(
    name: "Torso",
    center: SIMD3(0, 0.14 * s.y, 0),
    radius: SIMD3(0.32 * s.x, 0.34 * s.y, 0.2 * s.z),
    rotation: SIMD3(0, 0, 0),
    rings: 12, segments: 18, material: body
  ))
  for (name, sign) in [("ArmLeft", Float(-1)), ("ArmRight", Float(1))] {
    parts.append(StarterPart(
      name: name,
      center: SIMD3(sign * 0.42 * s.x, 0.14 * s.y, 0),
      radius: SIMD3(0.09 * s.x, 0.30 * s.y, 0.09 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 8, segments: 12, material: body
    ))
  }
  if robe {
    parts.append(StarterPart(
      name: "Robe",
      center: SIMD3(0, -0.42 * s.y, 0),
      radius: SIMD3(0.50 * s.x, 0.42 * s.y, 0.34 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 10, segments: 16, material: body
    ))
  } else {
    for (name, sign) in [("LegLeft", Float(-1)), ("LegRight", Float(1))] {
      parts.append(StarterPart(
        name: name,
        center: SIMD3(sign * 0.14 * s.x, -0.5 * s.y, 0),
        radius: SIMD3(0.12 * s.x, 0.34 * s.y, 0.12 * s.z),
        rotation: SIMD3(0, 0, 0),
        rings: 8, segments: 12, material: body
      ))
    }
  }
  if cape {
    parts.append(StarterPart(
      name: "Cape",
      center: SIMD3(0, 0.05 * s.y, -0.26 * s.z),
      radius: SIMD3(0.36 * s.x, 0.44 * s.y, 0.04 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 8, segments: 14, material: accentMat
    ))
  }
  switch hat {
  case .none: break
  case .helmet:
    parts.append(StarterPart(
      name: "Helmet",
      center: SIMD3(0, 0.72 * s.y, 0),
      radius: SIMD3(0.30 * s.x, 0.22 * s.y, 0.30 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 10, segments: 16, material: accentMat
    ))
  case .wizardHat:
    parts.append(StarterPart(
      name: "HatBrim",
      center: SIMD3(0, 0.86 * s.y, 0),
      radius: SIMD3(0.32 * s.x, 0.05 * s.y, 0.32 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 4, segments: 16, material: accentMat,
      primitive: .cylinder
    ))
    parts.append(StarterPart(
      name: "HatCone",
      center: SIMD3(0, 1.15 * s.y, 0),
      radius: SIMD3(0.24 * s.x, 0.36 * s.y, 0.24 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 12, segments: 14, material: accentMat,
      primitive: .cone
    ))
  case .crown:
    parts.append(StarterPart(
      name: "Crown",
      center: SIMD3(0, 0.88 * s.y, 0),
      radius: SIMD3(0.22 * s.x, 0.09 * s.y, 0.22 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 6, segments: 14, material: accentMat
    ))
  }
  return parts
}

/// Quadruped template — body oriented along +X (head at +X, tail at -X),
/// standing on 4 legs. Optional horn (unicorn), collar, and tail. Parameterized
/// by proportions so a chunky dog and a slim cat share the same anatomy code.
private func quadruped(
  body: Int,
  accent: Int? = nil,
  bodyScale: SIMD3<Float> = SIMD3(1, 1, 1),   // per-axis multiplier
  headScale: Float = 1,                       // relative to bodyScale
  hasHorn: Bool = false,                      // unicorn
  hasTail: Bool = true,
  hasEars: Bool = false                       // cat/dog perked ears
) -> [StarterPart] {
  let s = bodyScale
  let accentMat = accent ?? body
  var parts: [StarterPart] = []

  // Body — elongated horizontal ellipsoid, widest along X
  parts.append(StarterPart(
    name: "Body",
    center: SIMD3(0, 0, 0),
    radius: SIMD3(0.55 * s.x, 0.32 * s.y, 0.34 * s.z),
    rotation: SIMD3(0, 0, 0),
    rings: 12, segments: 18, material: body
  ))
  // Neck — thin connecting ellipsoid tilted up toward head
  parts.append(StarterPart(
    name: "Neck",
    center: SIMD3(0.42 * s.x, 0.18 * s.y, 0),
    radius: SIMD3(0.14 * s.x, 0.20 * s.y, 0.14 * s.z),
    rotation: SIMD3(0, 0, -0.5),
    rings: 8, segments: 12, material: body
  ))
  // Head
  parts.append(StarterPart(
    name: "Head",
    center: SIMD3(0.60 * s.x, 0.34 * s.y, 0),
    radius: SIMD3(0.24 * s.x * headScale, 0.22 * s.y * headScale, 0.24 * s.z * headScale),
    rotation: SIMD3(0, 0, 0),
    rings: 10, segments: 16, material: body
  ))
  // Snout / muzzle — small ellipsoid extending forward
  parts.append(StarterPart(
    name: "Snout",
    center: SIMD3(0.78 * s.x, 0.28 * s.y, 0),
    radius: SIMD3(0.14 * s.x * headScale, 0.10 * s.y * headScale, 0.13 * s.z * headScale),
    rotation: SIMD3(0, 0, 0),
    rings: 8, segments: 12, material: body
  ))
  // Legs — 4 short cylinders (ellipsoids) underneath
  for (name, xSign, zSign) in [
    ("LegFrontLeft",  Float(0.28), Float(0.22)),
    ("LegFrontRight", Float(0.28), Float(-0.22)),
    ("LegBackLeft",   Float(-0.32), Float(0.22)),
    ("LegBackRight",  Float(-0.32), Float(-0.22)),
  ] {
    parts.append(StarterPart(
      name: name,
      center: SIMD3(xSign * s.x, -0.34 * s.y, zSign * s.z),
      radius: SIMD3(0.10 * s.x, 0.24 * s.y, 0.10 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 8, segments: 12, material: body
    ))
  }
  if hasTail {
    parts.append(StarterPart(
      name: "Tail",
      center: SIMD3(-0.62 * s.x, 0.05 * s.y, 0),
      radius: SIMD3(0.20 * s.x, 0.10 * s.y, 0.10 * s.z),
      rotation: SIMD3(0, 0, 0.5),
      rings: 8, segments: 12, material: body
    ))
  }
  if hasEars {
    for (name, zSign) in [("EarLeft", Float(0.15)), ("EarRight", Float(-0.15))] {
      parts.append(StarterPart(
        name: name,
        center: SIMD3(0.56 * s.x, 0.52 * s.y, zSign * s.z),
        radius: SIMD3(0.05 * s.x, 0.10 * s.y, 0.05 * s.z),
        rotation: SIMD3(0, 0, 0),
        rings: 6, segments: 10, material: body
      ))
    }
  }
  if hasHorn {
    parts.append(StarterPart(
      name: "Horn",
      center: SIMD3(0.66 * s.x, 0.62 * s.y, 0),
      radius: SIMD3(0.06 * s.x, 0.26 * s.y, 0.06 * s.z),
      rotation: SIMD3(0, 0, -0.25),
      rings: 8, segments: 10, material: accentMat,
      primitive: .cone
    ))
  }
  return parts
}

/// Fish template — swimming forward along +X. Elongated body + vertical tail
/// fin behind + dorsal fin on top + two pectoral fins on the sides.
private func fish(
  body: Int,
  accent: Int? = nil,
  bodyScale: SIMD3<Float> = SIMD3(1, 1, 1)
) -> [StarterPart] {
  let s = bodyScale
  let accentMat = accent ?? body
  return [
    StarterPart(
      name: "Body",
      center: SIMD3(0, 0, 0),
      radius: SIMD3(0.55 * s.x, 0.28 * s.y, 0.22 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 12, segments: 18, material: body
    ),
    StarterPart(
      name: "TailFin",
      center: SIMD3(-0.72 * s.x, 0.02 * s.y, 0),
      radius: SIMD3(0.18 * s.x, 0.24 * s.y, 0.04 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 8, segments: 12, material: accentMat
    ),
    StarterPart(
      name: "DorsalFin",
      center: SIMD3(-0.05 * s.x, 0.32 * s.y, 0),
      radius: SIMD3(0.24 * s.x, 0.14 * s.y, 0.03 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 8, segments: 12, material: accentMat
    ),
    StarterPart(
      name: "PectoralLeft",
      center: SIMD3(0.15 * s.x, -0.05 * s.y, 0.22 * s.z),
      radius: SIMD3(0.14 * s.x, 0.04 * s.y, 0.10 * s.z),
      rotation: SIMD3(0.3, 0, 0),
      rings: 6, segments: 10, material: accentMat
    ),
    StarterPart(
      name: "PectoralRight",
      center: SIMD3(0.15 * s.x, -0.05 * s.y, -0.22 * s.z),
      radius: SIMD3(0.14 * s.x, 0.04 * s.y, 0.10 * s.z),
      rotation: SIMD3(-0.3, 0, 0),
      rings: 6, segments: 10, material: accentMat
    ),
  ]
}

/// Bird template — perched pose, facing +X. Small round body + head + beak
/// (accent), folded wings on ±Z, tail feathers behind, two stick legs below.
private func bird(
  body: Int,
  beak: Int? = nil,
  bodyScale: SIMD3<Float> = SIMD3(1, 1, 1)
) -> [StarterPart] {
  let s = bodyScale
  let beakMat = beak ?? body
  return [
    StarterPart(
      name: "Body",
      center: SIMD3(0, 0, 0),
      radius: SIMD3(0.36 * s.x, 0.32 * s.y, 0.32 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 12, segments: 18, material: body
    ),
    StarterPart(
      name: "Head",
      center: SIMD3(0.40 * s.x, 0.30 * s.y, 0),
      radius: SIMD3(0.22 * s.x, 0.22 * s.y, 0.22 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 10, segments: 16, material: body
    ),
    StarterPart(
      name: "Beak",
      center: SIMD3(0.62 * s.x, 0.28 * s.y, 0),
      radius: SIMD3(0.08 * s.x, 0.08 * s.y, 0.08 * s.z),
      rotation: SIMD3(0, 0, 1.5708),  // 90° around Z so cone apex points +X
      rings: 8, segments: 10, material: beakMat,
      primitive: .cone
    ),
    StarterPart(
      name: "WingLeft",
      center: SIMD3(-0.05 * s.x, 0.02 * s.y, 0.30 * s.z),
      radius: SIMD3(0.28 * s.x, 0.20 * s.y, 0.06 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 8, segments: 12, material: body
    ),
    StarterPart(
      name: "WingRight",
      center: SIMD3(-0.05 * s.x, 0.02 * s.y, -0.30 * s.z),
      radius: SIMD3(0.28 * s.x, 0.20 * s.y, 0.06 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 8, segments: 12, material: body
    ),
    StarterPart(
      name: "Tail",
      center: SIMD3(-0.40 * s.x, 0.06 * s.y, 0),
      radius: SIMD3(0.14 * s.x, 0.08 * s.y, 0.14 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 6, segments: 10, material: body
    ),
    StarterPart(
      name: "LegLeft",
      center: SIMD3(0.05 * s.x, -0.40 * s.y, 0.08 * s.z),
      radius: SIMD3(0.04 * s.x, 0.12 * s.y, 0.04 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 6, segments: 10, material: beakMat,
      primitive: .cylinder
    ),
    StarterPart(
      name: "LegRight",
      center: SIMD3(0.05 * s.x, -0.40 * s.y, -0.08 * s.z),
      radius: SIMD3(0.04 * s.x, 0.12 * s.y, 0.04 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 6, segments: 10, material: beakMat,
      primitive: .cylinder
    ),
  ]
}

/// Alien template — big oval head with two large dark almond eyes, small torso,
/// slim arms, twin antennae. Classic cartoon "little green man" silhouette.
private func alien(body: Int, eyes: Int) -> [StarterPart] {
  [
    StarterPart(name: "Head", center: SIMD3(0, 0.4, 0), radius: SIMD3(0.34, 0.42, 0.32), rotation: SIMD3(0, 0, 0), rings: 12, segments: 18, material: body),
    StarterPart(name: "EyeLeft", center: SIMD3(-0.14, 0.42, 0.28), radius: SIMD3(0.11, 0.16, 0.06), rotation: SIMD3(0, 0, -0.3), rings: 8, segments: 12, material: eyes),
    StarterPart(name: "EyeRight", center: SIMD3(0.14, 0.42, 0.28), radius: SIMD3(0.11, 0.16, 0.06), rotation: SIMD3(0, 0, 0.3), rings: 8, segments: 12, material: eyes),
    StarterPart(name: "Torso", center: SIMD3(0, -0.15, 0), radius: SIMD3(0.20, 0.24, 0.18), rotation: SIMD3(0, 0, 0), rings: 10, segments: 14, material: body),
    StarterPart(name: "ArmLeft", center: SIMD3(-0.30, -0.10, 0), radius: SIMD3(0.06, 0.24, 0.06), rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: body),
    StarterPart(name: "ArmRight", center: SIMD3(0.30, -0.10, 0), radius: SIMD3(0.06, 0.24, 0.06), rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: body),
    StarterPart(name: "LegLeft", center: SIMD3(-0.11, -0.55, 0), radius: SIMD3(0.08, 0.20, 0.08), rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: body),
    StarterPart(name: "LegRight", center: SIMD3(0.11, -0.55, 0), radius: SIMD3(0.08, 0.20, 0.08), rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: body),
    StarterPart(name: "AntennaLeft", center: SIMD3(-0.14, 0.90, 0), radius: SIMD3(0.03, 0.18, 0.03), rotation: SIMD3(0, 0, -0.12), rings: 6, segments: 10, material: body, primitive: .cylinder),
    StarterPart(name: "AntennaRight", center: SIMD3(0.14, 0.90, 0), radius: SIMD3(0.03, 0.18, 0.03), rotation: SIMD3(0, 0, 0.12), rings: 6, segments: 10, material: body, primitive: .cylinder),
    StarterPart(name: "AntennaTipLeft", center: SIMD3(-0.18, 1.10, 0), radius: SIMD3(0.07, 0.07, 0.07), rotation: SIMD3(0, 0, 0), rings: 8, segments: 10, material: eyes),
    StarterPart(name: "AntennaTipRight", center: SIMD3(0.18, 1.10, 0), radius: SIMD3(0.07, 0.07, 0.07), rotation: SIMD3(0, 0, 0), rings: 8, segments: 10, material: eyes),
  ]
}

/// Monster template — chunky blob body, one big central eye, twin horns,
/// stubby arms and legs. Reads as "friendly cartoon monster" at picker size.
private func monster(body: Int, eye: Int, horn: Int) -> [StarterPart] {
  [
    StarterPart(name: "Body", center: SIMD3(0, 0, 0), radius: SIMD3(0.55, 0.58, 0.48), rotation: SIMD3(0, 0, 0), rings: 14, segments: 20, material: body),
    StarterPart(name: "EyeWhite", center: SIMD3(0, 0.28, 0.44), radius: SIMD3(0.22, 0.22, 0.10), rotation: SIMD3(0, 0, 0), rings: 10, segments: 14, material: eye),
    StarterPart(name: "Pupil", center: SIMD3(0, 0.28, 0.52), radius: SIMD3(0.10, 0.10, 0.05), rotation: SIMD3(0, 0, 0), rings: 8, segments: 12, material: horn),
    StarterPart(name: "HornLeft", center: SIMD3(-0.28, 0.68, 0), radius: SIMD3(0.08, 0.24, 0.08), rotation: SIMD3(0, 0, -0.25), rings: 8, segments: 10, material: horn, primitive: .cone),
    StarterPart(name: "HornRight", center: SIMD3(0.28, 0.68, 0), radius: SIMD3(0.08, 0.24, 0.08), rotation: SIMD3(0, 0, 0.25), rings: 8, segments: 10, material: horn, primitive: .cone),
    StarterPart(name: "ArmLeft", center: SIMD3(-0.58, 0.02, 0), radius: SIMD3(0.10, 0.18, 0.10), rotation: SIMD3(0, 0, 0.35), rings: 6, segments: 10, material: body),
    StarterPart(name: "ArmRight", center: SIMD3(0.58, 0.02, 0), radius: SIMD3(0.10, 0.18, 0.10), rotation: SIMD3(0, 0, -0.35), rings: 6, segments: 10, material: body),
    StarterPart(name: "LegLeft", center: SIMD3(-0.24, -0.62, 0), radius: SIMD3(0.15, 0.18, 0.15), rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: body),
    StarterPart(name: "LegRight", center: SIMD3(0.24, -0.62, 0), radius: SIMD3(0.15, 0.18, 0.15), rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: body),
  ]
}

/// Tree template — brown trunk with a cluster of green foliage blobs on top.
/// Reads as a rounded cartoon tree at picker size (as opposed to the plain
/// green cone silhouette).
private func tree(trunk: Int, foliage: Int) -> [StarterPart] {
  [
    StarterPart(name: "Trunk", center: SIMD3(0, -0.35, 0), radius: SIMD3(0.14, 0.38, 0.14), rotation: SIMD3(0, 0, 0), rings: 10, segments: 14, material: trunk, primitive: .cylinder),
    StarterPart(name: "FoliageMain", center: SIMD3(0, 0.36, 0), radius: SIMD3(0.44, 0.34, 0.44), rotation: SIMD3(0, 0, 0), rings: 12, segments: 16, material: foliage),
    StarterPart(name: "FoliageLeft", center: SIMD3(-0.28, 0.20, 0.12), radius: SIMD3(0.28, 0.26, 0.28), rotation: SIMD3(0, 0, 0), rings: 10, segments: 14, material: foliage),
    StarterPart(name: "FoliageRight", center: SIMD3(0.26, 0.22, -0.10), radius: SIMD3(0.26, 0.24, 0.26), rotation: SIMD3(0, 0, 0), rings: 10, segments: 14, material: foliage),
    StarterPart(name: "FoliageTop", center: SIMD3(0.02, 0.62, -0.04), radius: SIMD3(0.22, 0.20, 0.22), rotation: SIMD3(0, 0, 0), rings: 8, segments: 12, material: foliage),
  ]
}

/// Rock template — asymmetric main boulder with a couple of smaller companion
/// stones clustered around its base, reading as a natural little rock pile
/// rather than a perfect sphere.
private func rock(stone: Int) -> [StarterPart] {
  [
    StarterPart(name: "Main", center: SIMD3(0, 0, 0), radius: SIMD3(0.55, 0.42, 0.48), rotation: SIMD3(0.10, 0.15, -0.08), rings: 10, segments: 14, material: stone),
    StarterPart(name: "PebbleLeft", center: SIMD3(-0.45, -0.25, 0.20), radius: SIMD3(0.25, 0.20, 0.22), rotation: SIMD3(0.15, 0, 0.20), rings: 8, segments: 12, material: stone),
    StarterPart(name: "PebbleRight", center: SIMD3(0.40, -0.30, -0.15), radius: SIMD3(0.23, 0.17, 0.20), rotation: SIMD3(-0.10, 0.25, 0), rings: 8, segments: 12, material: stone),
    StarterPart(name: "PebbleTop", center: SIMD3(0.10, 0.30, -0.30), radius: SIMD3(0.18, 0.14, 0.16), rotation: SIMD3(0.20, -0.15, 0.10), rings: 8, segments: 12, material: stone),
  ]
}

/// Ghost template — classic Pac-Man-shaped spook: rounded body, three round
/// bumps at the bottom (wavy skirt approximation), two dark eyes on the face.
private func ghost(body: Int, eyes: Int) -> [StarterPart] {
  [
    StarterPart(name: "Body", center: SIMD3(0, 0.12, 0), radius: SIMD3(0.36, 0.50, 0.36), rotation: SIMD3(0, 0, 0), rings: 14, segments: 20, material: body),
    StarterPart(name: "BumpLeft", center: SIMD3(-0.24, -0.44, 0), radius: SIMD3(0.14, 0.12, 0.14), rotation: SIMD3(0, 0, 0), rings: 8, segments: 12, material: body),
    StarterPart(name: "BumpMiddle", center: SIMD3(0, -0.46, 0), radius: SIMD3(0.14, 0.10, 0.14), rotation: SIMD3(0, 0, 0), rings: 8, segments: 12, material: body),
    StarterPart(name: "BumpRight", center: SIMD3(0.24, -0.44, 0), radius: SIMD3(0.14, 0.12, 0.14), rotation: SIMD3(0, 0, 0), rings: 8, segments: 12, material: body),
    StarterPart(name: "EyeLeft", center: SIMD3(-0.13, 0.22, 0.34), radius: SIMD3(0.06, 0.09, 0.05), rotation: SIMD3(0, 0, 0), rings: 8, segments: 12, material: eyes),
    StarterPart(name: "EyeRight", center: SIMD3(0.13, 0.22, 0.34), radius: SIMD3(0.06, 0.09, 0.05), rotation: SIMD3(0, 0, 0), rings: 8, segments: 12, material: eyes),
  ]
}

func starterCatalog() -> [StarterCharacter] {
  [
    // Quadrupeds — share the quadruped() template (body + neck + head + snout +
    // 4 legs + tail), with per-character horns/ears/proportions.
    StarterCharacter(
      id: "dinosaur", displayName: "Dinosaur", description: "A friendly toy dinosaur.",
      aliases: ["dino"], defaultSize: 1.0,
      materials: material("Dinosaur Green", SIMD4(0.12, 0.55, 0.22, 1)),
      parts: quadruped(body: 0, bodyScale: SIMD3(1.35, 1.1, 0.95), headScale: 1.1)
    ),
    StarterCharacter(
      id: "unicorn", displayName: "Unicorn", description: "A bright magical toy unicorn.",
      aliases: ["pony"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Unicorn Pearl", color: SIMD4(0.9, 0.72, 0.88, 1), metallic: 0.25, roughness: 0.5),
        StarterMaterial(name: "Unicorn Horn Gold", color: SIMD4(0.95, 0.75, 0.15, 1), metallic: 0.85, roughness: 0.18),
      ],
      parts: quadruped(body: 0, accent: 1, bodyScale: SIMD3(1.2, 1.1, 0.9), hasHorn: true, hasEars: true)
    ),
    // Humanoids — all share the humanoid() template and vary via material palette,
    // per-axis bodyScale, and optional hat/cape/robe accessories. The single
    // template keeps proportions consistent so kids reading the picker recognize
    // them as "people of this kind" rather than 8 unrelated silhouettes.
    StarterCharacter(
      id: "robot", displayName: "Robot", description: "A cheerful helper robot.",
      aliases: ["bot"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Robot Silver", color: SIMD4(0.48, 0.58, 0.68, 1), metallic: 0.8, roughness: 0.25),
        StarterMaterial(name: "Robot Visor", color: SIMD4(0.18, 0.32, 0.52, 1), metallic: 0.75, roughness: 0.2),
      ],
      parts: humanoid(body: 0, accent: 1, hat: .helmet, bodyScale: SIMD3(1.05, 1, 1.05))
    ),
    StarterCharacter(
      id: "knight", displayName: "Knight", description: "A brave armored toy knight.",
      aliases: ["warrior"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Knight Steel", color: SIMD4(0.42, 0.48, 0.58, 1), metallic: 0.7, roughness: 0.35),
        StarterMaterial(name: "Knight Trim", color: SIMD4(0.15, 0.18, 0.22, 1), metallic: 0.6, roughness: 0.4),
      ],
      parts: humanoid(body: 0, accent: 1, hat: .helmet, bodyScale: SIMD3(1.05, 1, 1.02))
    ),
    StarterCharacter(
      id: "wizard", displayName: "Wizard", description: "A wise toy wizard.",
      aliases: ["mage"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Wizard Violet", color: SIMD4(0.38, 0.16, 0.66, 1), metallic: 0.15, roughness: 0.65),
        StarterMaterial(name: "Wizard Hat", color: SIMD4(0.15, 0.08, 0.32, 1), metallic: 0.2, roughness: 0.55),
      ],
      parts: humanoid(body: 0, accent: 1, hat: .wizardHat, robe: true)
    ),
    StarterCharacter(
      id: "princess", displayName: "Princess", description: "A royal toy adventurer.",
      aliases: ["royal"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Princess Rose", color: SIMD4(0.86, 0.3, 0.58, 1), metallic: 0.2, roughness: 0.5),
        StarterMaterial(name: "Princess Gold", color: SIMD4(0.95, 0.75, 0.15, 1), metallic: 0.85, roughness: 0.18),
      ],
      parts: humanoid(body: 0, accent: 1, hat: .crown, robe: true)
    ),
    StarterCharacter(
      id: "astronaut", displayName: "Astronaut", description: "A space-exploring toy astronaut.",
      aliases: ["space explorer"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Astronaut White", color: SIMD4(0.82, 0.86, 0.9, 1), metallic: 0.25, roughness: 0.4),
        StarterMaterial(name: "Astronaut Visor", color: SIMD4(0.15, 0.28, 0.5, 1), metallic: 0.9, roughness: 0.12),
      ],
      parts: humanoid(body: 0, accent: 1, hat: .helmet)
    ),
    StarterCharacter(
      id: "ninja", displayName: "Ninja", description: "A quick and quiet toy ninja.",
      aliases: ["shinobi"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Ninja Charcoal", color: SIMD4(0.06, 0.07, 0.09, 1), metallic: 0.2, roughness: 0.7),
      ],
      parts: humanoid(body: 0, bodyScale: SIMD3(0.9, 1, 0.9))
    ),
    StarterCharacter(
      id: "puppy", displayName: "Puppy", description: "A playful toy puppy.",
      aliases: ["pup"], defaultSize: 1.0,
      materials: material("Puppy Gold", SIMD4(0.68, 0.4, 0.16, 1)),
      parts: quadruped(body: 0, bodyScale: SIMD3(0.9, 0.8, 0.8), headScale: 1.15, hasEars: true)
    ),
    StarterCharacter(
      id: "superhero", displayName: "Superhero", description: "A soaring toy superhero.",
      aliases: ["hero"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Hero Blue", color: SIMD4(0.05, 0.24, 0.72, 1), metallic: 0.2, roughness: 0.5),
        StarterMaterial(name: "Hero Cape Red", color: SIMD4(0.75, 0.12, 0.14, 1), metallic: 0.15, roughness: 0.55),
      ],
      parts: humanoid(body: 0, accent: 1, cape: true, bodyScale: SIMD3(1.02, 1, 1.02))
    ),
    StarterCharacter(
      id: "hero", displayName: "Hero", description: "A plucky toy adventurer.",
      aliases: ["protagonist", "main character", "player"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Hero Denim", color: SIMD4(0.20, 0.38, 0.72, 1), metallic: 0.15, roughness: 0.6),
      ],
      parts: humanoid(body: 0)
    ),
    // Animals — Dog & Cat use the quadruped() template with different palettes;
    // Fish and Bird have their own dedicated templates (see fish() and bird()).
    StarterCharacter(
      id: "dog", displayName: "Dog", description: "A loyal toy dog.",
      aliases: ["hound", "canine", "doggy"], defaultSize: 1.0,
      materials: material("Dog Brown", SIMD4(0.55, 0.34, 0.18, 1)),
      parts: quadruped(body: 0, bodyScale: SIMD3(1.05, 0.85, 0.85), headScale: 1.05, hasEars: true)
    ),
    StarterCharacter(
      id: "cat", displayName: "Cat", description: "A sneaky toy cat.",
      aliases: ["kitten", "kitty", "feline"], defaultSize: 1.0,
      materials: material("Cat Orange", SIMD4(0.92, 0.42, 0.10, 1)),
      parts: quadruped(body: 0, bodyScale: SIMD3(0.95, 0.75, 0.75), headScale: 1.1, hasEars: true)
    ),
    StarterCharacter(
      id: "fish", displayName: "Fish", description: "A tiny toy fish.",
      aliases: ["minnow", "guppy", "goldfish", "trout"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Fish Blue", color: SIMD4(0.30, 0.55, 0.92, 1), metallic: 0.35, roughness: 0.4),
        StarterMaterial(name: "Fish Fin", color: SIMD4(0.16, 0.32, 0.68, 1), metallic: 0.3, roughness: 0.45),
      ],
      parts: fish(body: 0, accent: 1)
    ),
    StarterCharacter(
      id: "bird", displayName: "Bird", description: "A small toy bird.",
      aliases: ["sparrow", "robin", "chick", "chirper"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Bird Sky Blue", color: SIMD4(0.42, 0.72, 0.95, 1), metallic: 0.2, roughness: 0.55),
        StarterMaterial(name: "Bird Beak", color: SIMD4(0.95, 0.68, 0.15, 1), metallic: 0.4, roughness: 0.35),
      ],
      parts: bird(body: 0, beak: 1)
    ),
    // Fantasy creatures — alien and monster have their own dedicated templates.
    StarterCharacter(
      id: "alien", displayName: "Alien", description: "A friendly toy alien.",
      aliases: ["extraterrestrial", "martian", "et", "ufo"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Alien Green", color: SIMD4(0.28, 0.75, 0.32, 1), metallic: 0.2, roughness: 0.55),
        StarterMaterial(name: "Alien Eyes", color: SIMD4(0.04, 0.04, 0.06, 1), metallic: 0.7, roughness: 0.15),
      ],
      parts: alien(body: 0, eyes: 1)
    ),
    StarterCharacter(
      id: "monster", displayName: "Monster", description: "A goofy toy monster.",
      aliases: ["creature", "beast", "ogre", "troll", "goblin", "blob"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Monster Purple", color: SIMD4(0.52, 0.20, 0.85, 1), metallic: 0.15, roughness: 0.6),
        StarterMaterial(name: "Monster Eye White", color: SIMD4(0.95, 0.95, 0.92, 1), metallic: 0.1, roughness: 0.35),
        StarterMaterial(name: "Monster Dark", color: SIMD4(0.08, 0.08, 0.10, 1), metallic: 0.4, roughness: 0.3),
      ],
      parts: monster(body: 0, eye: 1, horn: 2)
    ),
    // Props — tree and rock use dedicated templates so the tile reads as a
    // rounded cartoon object rather than a bare primitive silhouette.
    StarterCharacter(
      id: "tree", displayName: "Tree", description: "A leafy toy tree.",
      aliases: ["bush", "shrub", "pine", "fir", "oak"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Tree Trunk", color: SIMD4(0.42, 0.24, 0.10, 1), metallic: 0.1, roughness: 0.75),
        StarterMaterial(name: "Tree Leaves", color: SIMD4(0.16, 0.55, 0.22, 1), metallic: 0.05, roughness: 0.7),
      ],
      parts: tree(trunk: 0, foliage: 1)
    ),
    StarterCharacter(
      id: "rock", displayName: "Rock", description: "A chunky toy boulder.",
      aliases: ["stone", "pebble", "boulder"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Stone Grey", color: SIMD4(0.42, 0.40, 0.38, 1), metallic: 0.2, roughness: 0.65),
      ],
      parts: rock(stone: 0)
    ),
    StarterCharacter(
      id: "ghost", displayName: "Ghost", description: "A friendly toy ghost.",
      aliases: ["spirit", "phantom", "spook", "boo"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Ghost White", color: SIMD4(0.93, 0.94, 0.96, 1), metallic: 0.05, roughness: 0.5),
        StarterMaterial(name: "Ghost Eyes", color: SIMD4(0.06, 0.08, 0.15, 1), metallic: 0.4, roughness: 0.25),
      ],
      parts: ghost(body: 0, eyes: 1)
    ),
    // Dragon — actually shaped like a dragon: torso + neck + head + snout,
    // paired horns, spread wings, four legs, and a three-segment tail. Anatomy
    // scaled from the standalone metal-dragon tool so it reads as a creature at
    // starter size (~2u across) instead of a single ellipsoid.
    StarterCharacter(
      id: "dragon", displayName: "Dragon", description: "A fierce toy dragon.",
      aliases: ["drake", "wyrm", "wyvern"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Dragon Red Metal", color: SIMD4(0.55, 0.012, 0.018, 1), metallic: 0.82, roughness: 0.24),
        StarterMaterial(name: "Dark Horn", color: SIMD4(0.055, 0.018, 0.022, 1), metallic: 0.58, roughness: 0.3),
        StarterMaterial(name: "Dark Wing", color: SIMD4(0.19, 0.012, 0.02, 1), metallic: 0.35, roughness: 0.42),
      ],
      parts: [
        StarterPart(name: "Torso", center: SIMD3(0, 0, 0), radius: SIMD3(0.775, 0.41, 0.46), rotation: SIMD3(0, 0, 0), rings: 16, segments: 24, material: 0),
        StarterPart(name: "Neck", center: SIMD3(0.56, 0.34, 0), radius: SIMD3(0.24, 0.38, 0.24), rotation: SIMD3(0, 0, -0.48), rings: 12, segments: 20, material: 0),
        StarterPart(name: "Head", center: SIMD3(0.86, 0.64, 0), radius: SIMD3(0.36, 0.27, 0.29), rotation: SIMD3(0, 0, 0.08), rings: 12, segments: 20, material: 0),
        StarterPart(name: "Snout", center: SIMD3(1.14, 0.585, 0), radius: SIMD3(0.27, 0.15, 0.21), rotation: SIMD3(0, 0, 0), rings: 10, segments: 16, material: 0),
        StarterPart(name: "HornLeft", center: SIMD3(0.77, 0.93, 0.18), radius: SIMD3(0.08, 0.32, 0.08), rotation: SIMD3(0.22, 0, -0.36), rings: 10, segments: 10, material: 1, primitive: .cone),
        StarterPart(name: "HornRight", center: SIMD3(0.77, 0.93, -0.18), radius: SIMD3(0.08, 0.32, 0.08), rotation: SIMD3(-0.22, 0, -0.36), rings: 10, segments: 10, material: 1, primitive: .cone),
        StarterPart(name: "WingLeft", center: SIMD3(-0.11, 0.31, 0.56), radius: SIMD3(0.81, 0.065, 0.36), rotation: SIMD3(-0.20, -0.35, 0.15), rings: 12, segments: 20, material: 2),
        StarterPart(name: "WingRight", center: SIMD3(-0.11, 0.31, -0.56), radius: SIMD3(0.81, 0.065, 0.36), rotation: SIMD3(0.20, 0.35, 0.15), rings: 12, segments: 20, material: 2),
        StarterPart(name: "LegFrontLeft", center: SIMD3(0.41, -0.49, 0.29), radius: SIMD3(0.14, 0.43, 0.14), rotation: SIMD3(0, 0, 0.10), rings: 10, segments: 16, material: 0),
        StarterPart(name: "LegFrontRight", center: SIMD3(0.41, -0.49, -0.29), radius: SIMD3(0.14, 0.43, 0.14), rotation: SIMD3(0, 0, -0.10), rings: 10, segments: 16, material: 0),
        StarterPart(name: "LegBackLeft", center: SIMD3(-0.45, -0.46, 0.305), radius: SIMD3(0.17, 0.46, 0.17), rotation: SIMD3(0, 0, -0.12), rings: 10, segments: 16, material: 0),
        StarterPart(name: "LegBackRight", center: SIMD3(-0.45, -0.46, -0.305), radius: SIMD3(0.17, 0.46, 0.17), rotation: SIMD3(0, 0, 0.12), rings: 10, segments: 16, material: 0),
        StarterPart(name: "TailBase", center: SIMD3(-0.835, 0, 0), radius: SIMD3(0.36, 0.21, 0.21), rotation: SIMD3(0, 0, -0.38), rings: 8, segments: 14, material: 0),
        StarterPart(name: "TailMiddle", center: SIMD3(-1.13, -0.15, 0), radius: SIMD3(0.27, 0.145, 0.145), rotation: SIMD3(0, 0, -0.43), rings: 7, segments: 12, material: 0),
        StarterPart(name: "TailTip", center: SIMD3(-1.34, -0.315, 0), radius: SIMD3(0.175, 0.085, 0.085), rotation: SIMD3(0, 0, -0.56), rings: 6, segments: 10, material: 0),
      ]
    ),
  ]
}
