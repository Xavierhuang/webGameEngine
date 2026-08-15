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

/// Shared dark face material used for eye and mouth ellipsoids on humanoids,
/// quadrupeds, fish, and bird. Ninja gets its own light variant since a dark
/// eye disappears against its charcoal body — see FACE_LIGHT below.
private let FACE_DARK = StarterMaterial(
  name: "Face Dark",
  color: SIMD4(0.05, 0.05, 0.08, 1),
  metallic: 0.2,
  roughness: 0.4
)
private let FACE_LIGHT = StarterMaterial(
  name: "Face Light",
  color: SIMD4(0.95, 0.95, 0.98, 1),
  metallic: 0.1,
  roughness: 0.5
)

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
  face: Int? = nil,
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
  // Face features (eyes + mouth) — humanoid faces +Z. Only rendered when the
  // character supplies a face material index; otherwise the head reads as a
  // plain ellipsoid (backward compatible).
  if let faceMat = face {
    parts.append(StarterPart(
      name: "EyeLeft",
      center: SIMD3(-0.09 * s.x, 0.66 * s.y, 0.21 * s.z),
      radius: SIMD3(0.045 * s.x, 0.055 * s.y, 0.030 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 8, segments: 10, material: faceMat
    ))
    parts.append(StarterPart(
      name: "EyeRight",
      center: SIMD3(0.09 * s.x, 0.66 * s.y, 0.21 * s.z),
      radius: SIMD3(0.045 * s.x, 0.055 * s.y, 0.030 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 8, segments: 10, material: faceMat
    ))
    parts.append(StarterPart(
      name: "Mouth",
      center: SIMD3(0, 0.55 * s.y, 0.22 * s.z),
      radius: SIMD3(0.065 * s.x, 0.020 * s.y, 0.020 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 6, segments: 10, material: faceMat
    ))
  }
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
  face: Int? = nil,
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
  // Face — two side-set eyes on the head + a small dark nose at the snout tip.
  // Positioned on +X (creature's front) and mirrored across Z.
  if let faceMat = face {
    for (name, zSign) in [("EyeLeft", Float(1)), ("EyeRight", Float(-1))] {
      parts.append(StarterPart(
        name: name,
        center: SIMD3(0.72 * s.x, 0.42 * s.y, zSign * 0.14 * s.z),
        radius: SIMD3(0.045 * s.x * headScale, 0.045 * s.y * headScale, 0.045 * s.z * headScale),
        rotation: SIMD3(0, 0, 0),
        rings: 6, segments: 10, material: faceMat
      ))
    }
    parts.append(StarterPart(
      name: "Nose",
      center: SIMD3(0.90 * s.x, 0.25 * s.y, 0),
      radius: SIMD3(0.05 * s.x * headScale, 0.045 * s.y * headScale, 0.05 * s.z * headScale),
      rotation: SIMD3(0, 0, 0),
      rings: 6, segments: 10, material: faceMat
    ))
  }
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
  face: Int? = nil,
  bodyScale: SIMD3<Float> = SIMD3(1, 1, 1)
) -> [StarterPart] {
  let s = bodyScale
  let accentMat = accent ?? body
  var parts: [StarterPart] = [
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
  // Face — eyes on both sides of the head (front of the body ellipsoid) and
  // a small dark mouth ellipsoid at the leading edge.
  if let faceMat = face {
    for (name, zSign) in [("EyeLeft", Float(1)), ("EyeRight", Float(-1))] {
      parts.append(StarterPart(
        name: name,
        center: SIMD3(0.35 * s.x, 0.06 * s.y, zSign * 0.17 * s.z),
        radius: SIMD3(0.055 * s.x, 0.07 * s.y, 0.030 * s.z),
        rotation: SIMD3(0, 0, 0),
        rings: 6, segments: 10, material: faceMat
      ))
    }
    parts.append(StarterPart(
      name: "Mouth",
      center: SIMD3(0.52 * s.x, -0.03 * s.y, 0),
      radius: SIMD3(0.045 * s.x, 0.020 * s.y, 0.055 * s.z),
      rotation: SIMD3(0, 0, 0),
      rings: 6, segments: 10, material: faceMat
    ))
  }
  return parts
}

/// Bird template — perched pose, facing +X. Small round body + head + beak
/// (accent), folded wings on ±Z, tail feathers behind, two stick legs below.
private func bird(
  body: Int,
  beak: Int? = nil,
  face: Int? = nil,
  bodyScale: SIMD3<Float> = SIMD3(1, 1, 1)
) -> [StarterPart] {
  let s = bodyScale
  let beakMat = beak ?? body
  var parts: [StarterPart] = [
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
  // Face — small dark eyes on both sides of the head.
  if let faceMat = face {
    for (name, zSign) in [("EyeLeft", Float(1)), ("EyeRight", Float(-1))] {
      parts.append(StarterPart(
        name: name,
        center: SIMD3(0.42 * s.x, 0.34 * s.y, zSign * 0.16 * s.z),
        radius: SIMD3(0.045 * s.x, 0.055 * s.y, 0.030 * s.z),
        rotation: SIMD3(0, 0, 0),
        rings: 6, segments: 10, material: faceMat
      ))
    }
  }
  return parts
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

/// Hero template — a properly-detailed adventurer built on top of the shared
/// humanoid silhouette (head + torso + arms + legs) with hero-specific accents:
/// hair cap, chest emblem badge, belt cylinder, gloves at the wrists, and
/// boots at the feet. Arms and legs are cylinders (proper flat ends) so the
/// gloves and boots visibly cap them instead of blending in.
private func hero(
  body: Int,
  dark: Int,
  emblem: Int
) -> [StarterPart] {
  var parts: [StarterPart] = []
  // Head
  parts.append(StarterPart(
    name: "Head",
    center: SIMD3(0, 0.62, 0),
    radius: SIMD3(0.24, 0.26, 0.24),
    rotation: SIMD3(0, 0, 0),
    rings: 12, segments: 18, material: body
  ))
  // Face — eyes + mouth. Uses the shared dark material (same as hair/belt) so
  // features read as unified silhouette detail rather than a separate palette.
  parts.append(StarterPart(
    name: "EyeLeft",
    center: SIMD3(-0.09, 0.66, 0.21),
    radius: SIMD3(0.045, 0.055, 0.030),
    rotation: SIMD3(0, 0, 0),
    rings: 6, segments: 10, material: dark
  ))
  parts.append(StarterPart(
    name: "EyeRight",
    center: SIMD3(0.09, 0.66, 0.21),
    radius: SIMD3(0.045, 0.055, 0.030),
    rotation: SIMD3(0, 0, 0),
    rings: 6, segments: 10, material: dark
  ))
  parts.append(StarterPart(
    name: "Mouth",
    center: SIMD3(0, 0.55, 0.22),
    radius: SIMD3(0.065, 0.020, 0.020),
    rotation: SIMD3(0, 0, 0),
    rings: 6, segments: 10, material: dark
  ))
  // Hair — flatter cap sitting on top-back of the head, sharper than a full sphere.
  parts.append(StarterPart(
    name: "Hair",
    center: SIMD3(0, 0.78, -0.02),
    radius: SIMD3(0.245, 0.11, 0.245),
    rotation: SIMD3(0, 0, 0),
    rings: 10, segments: 16, material: dark
  ))
  // Torso
  parts.append(StarterPart(
    name: "Torso",
    center: SIMD3(0, 0.14, 0),
    radius: SIMD3(0.32, 0.34, 0.20),
    rotation: SIMD3(0, 0, 0),
    rings: 12, segments: 18, material: body
  ))
  // Chest emblem — gold star/badge on the front of the torso.
  parts.append(StarterPart(
    name: "ChestEmblem",
    center: SIMD3(0, 0.24, 0.20),
    radius: SIMD3(0.08, 0.08, 0.04),
    rotation: SIMD3(0, 0, 0),
    rings: 8, segments: 12, material: emblem
  ))
  // Belt — thin dark cylinder around the waist. Flat top/bottom makes it read
  // as a real belt instead of a fat ring.
  parts.append(StarterPart(
    name: "Belt",
    center: SIMD3(0, -0.20, 0),
    radius: SIMD3(0.34, 0.06, 0.22),
    rotation: SIMD3(0, 0, 0),
    rings: 4, segments: 16, material: dark,
    primitive: .cylinder
  ))
  // Arms — cylinders so the gloves cap them cleanly.
  for (name, sign) in [("ArmLeft", Float(-1)), ("ArmRight", Float(1))] {
    parts.append(StarterPart(
      name: name,
      center: SIMD3(sign * 0.42, 0.14, 0),
      radius: SIMD3(0.09, 0.28, 0.09),
      rotation: SIMD3(0, 0, 0),
      rings: 8, segments: 12, material: body,
      primitive: .cylinder
    ))
  }
  // Gloves — dark ellipsoids at the wrist ends of each arm.
  for (name, sign) in [("GloveLeft", Float(-1)), ("GloveRight", Float(1))] {
    parts.append(StarterPart(
      name: name,
      center: SIMD3(sign * 0.42, -0.22, 0),
      radius: SIMD3(0.11, 0.09, 0.11),
      rotation: SIMD3(0, 0, 0),
      rings: 8, segments: 12, material: dark
    ))
  }
  // Legs — cylinders for the same reason as arms.
  for (name, sign) in [("LegLeft", Float(-1)), ("LegRight", Float(1))] {
    parts.append(StarterPart(
      name: name,
      center: SIMD3(sign * 0.14, -0.52, 0),
      radius: SIMD3(0.12, 0.30, 0.12),
      rotation: SIMD3(0, 0, 0),
      rings: 8, segments: 12, material: body,
      primitive: .cylinder
    ))
  }
  // Boots — dark ellipsoids at the foot end, extended slightly forward so they
  // read as shoes rather than as leg-cap balls.
  for (name, sign) in [("BootLeft", Float(-1)), ("BootRight", Float(1))] {
    parts.append(StarterPart(
      name: name,
      center: SIMD3(sign * 0.14, -0.86, 0.05),
      radius: SIMD3(0.14, 0.08, 0.18),
      rotation: SIMD3(0, 0, 0),
      rings: 8, segments: 12, material: dark
    ))
  }
  return parts
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

// MARK: - Object and creature archetypes
//
// The first 39 starters were built from ten silhouettes, and fifteen of them
// were the same humanoid in different colours. Growing that set by recolouring
// would have added rows to the picker without adding variety, so everything
// below is a genuinely new shape: vehicles, small creatures with their own body
// plans, and props a game needs. Each is positioned so its feet/base sit near
// y = -0.5 and it stands roughly one unit tall, matching the existing roster.

/// Four wheels, a body and a cabin — the silhouette reads as "car" at thumbnail
/// size, which is the only size that matters in the picker.
private func car(body: Int, dark: Int, glass: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Body", center: SIMD3(0, -0.05, 0), radius: SIMD3(0.62, 0.20, 0.32),
                           rotation: SIMD3(0, 0, 0), rings: 10, segments: 18, material: body))
  parts.append(StarterPart(name: "Cabin", center: SIMD3(-0.05, 0.20, 0), radius: SIMD3(0.32, 0.18, 0.27),
                           rotation: SIMD3(0, 0, 0), rings: 10, segments: 16, material: body))
  parts.append(StarterPart(name: "Windshield", center: SIMD3(0.17, 0.20, 0), radius: SIMD3(0.10, 0.13, 0.24),
                           rotation: SIMD3(0, 0, -0.35), rings: 8, segments: 14, material: glass))
  for (name, x, z) in [("WheelFrontLeft", Float(0.36), Float(0.30)), ("WheelFrontRight", 0.36, -0.30),
                       ("WheelBackLeft", -0.36, 0.30), ("WheelBackRight", -0.36, -0.30)] {
    parts.append(StarterPart(name: name, center: SIMD3(x, -0.28, z), radius: SIMD3(0.17, 0.17, 0.09),
                             rotation: SIMD3(1.5708, 0, 0), rings: 8, segments: 16, material: dark,
                             primitive: .cylinder))
  }
  return parts
}

/// Nose cone, tube body, three fins and an exhaust flare.
private func rocket(body: Int, accent: Int, flame: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Body", center: SIMD3(0, 0.02, 0), radius: SIMD3(0.20, 0.42, 0.20),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 18, material: body,
                           primitive: .cylinder))
  parts.append(StarterPart(name: "NoseCone", center: SIMD3(0, 0.62, 0), radius: SIMD3(0.20, 0.26, 0.20),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 18, material: accent,
                           primitive: .cone))
  parts.append(StarterPart(name: "Window", center: SIMD3(0, 0.20, 0.19), radius: SIMD3(0.09, 0.09, 0.06),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 14, material: accent))
  for i in 0..<3 {
    let a = Float(i) * 2.0944
    parts.append(StarterPart(name: "Fin\(i)", center: SIMD3(cos(a) * 0.22, -0.34, sin(a) * 0.22),
                             radius: SIMD3(0.10, 0.18, 0.05), rotation: SIMD3(0, -a, 0),
                             rings: 6, segments: 10, material: accent, primitive: .cone))
  }
  parts.append(StarterPart(name: "Exhaust", center: SIMD3(0, -0.52, 0), radius: SIMD3(0.13, 0.14, 0.13),
                           rotation: SIMD3(3.1416, 0, 0), rings: 6, segments: 14, material: flame,
                           primitive: .cone))
  return parts
}

/// Hull, mast and a triangular sail.
private func boat(hull: Int, sail: Int, mast: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Hull", center: SIMD3(0, -0.34, 0), radius: SIMD3(0.58, 0.18, 0.26),
                           rotation: SIMD3(0, 0, 0), rings: 10, segments: 18, material: hull))
  parts.append(StarterPart(name: "Deck", center: SIMD3(0, -0.19, 0), radius: SIMD3(0.50, 0.05, 0.22),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 16, material: hull))
  parts.append(StarterPart(name: "Mast", center: SIMD3(-0.02, 0.18, 0), radius: SIMD3(0.035, 0.42, 0.035),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: mast,
                           primitive: .cylinder))
  parts.append(StarterPart(name: "Sail", center: SIMD3(0.16, 0.16, 0), radius: SIMD3(0.26, 0.34, 0.03),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: sail,
                           primitive: .cone))
  return parts
}

/// Fuselage, straight wings, tail fin and a nose propeller.
private func airplane(body: Int, wing: Int, dark: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Fuselage", center: SIMD3(0, 0, 0), radius: SIMD3(0.14, 0.52, 0.14),
                           rotation: SIMD3(0, 0, 1.5708), rings: 8, segments: 16, material: body,
                           primitive: .cylinder))
  parts.append(StarterPart(name: "Nose", center: SIMD3(0.58, 0, 0), radius: SIMD3(0.14, 0.14, 0.14),
                           rotation: SIMD3(0, 0, -1.5708), rings: 8, segments: 14, material: dark,
                           primitive: .cone))
  parts.append(StarterPart(name: "Wings", center: SIMD3(-0.02, -0.02, 0), radius: SIMD3(0.18, 0.035, 0.62),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 14, material: wing))
  parts.append(StarterPart(name: "TailFin", center: SIMD3(-0.44, 0.18, 0), radius: SIMD3(0.10, 0.18, 0.03),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: wing))
  parts.append(StarterPart(name: "TailWing", center: SIMD3(-0.44, 0, 0), radius: SIMD3(0.09, 0.03, 0.24),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: wing))
  parts.append(StarterPart(name: "Cockpit", center: SIMD3(0.14, 0.14, 0), radius: SIMD3(0.14, 0.09, 0.11),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 14, material: dark))
  return parts
}

/// Boiler, cab, funnel and wheels.
private func train(body: Int, dark: Int, accent: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Boiler", center: SIMD3(0.14, -0.02, 0), radius: SIMD3(0.20, 0.42, 0.20),
                           rotation: SIMD3(0, 0, 1.5708), rings: 8, segments: 16, material: body,
                           primitive: .cylinder))
  parts.append(StarterPart(name: "Cab", center: SIMD3(-0.38, 0.06, 0), radius: SIMD3(0.22, 0.26, 0.23),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 14, material: accent))
  parts.append(StarterPart(name: "Funnel", center: SIMD3(0.46, 0.26, 0), radius: SIMD3(0.09, 0.16, 0.09),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 12, material: dark,
                           primitive: .cylinder))
  parts.append(StarterPart(name: "Front", center: SIMD3(0.58, -0.02, 0), radius: SIMD3(0.06, 0.20, 0.20),
                           rotation: SIMD3(0, 0, 1.5708), rings: 6, segments: 14, material: dark,
                           primitive: .cylinder))
  for (name, x, z) in [("WheelFrontLeft", Float(0.30), Float(0.22)), ("WheelFrontRight", 0.30, -0.22),
                       ("WheelBackLeft", -0.34, 0.22), ("WheelBackRight", -0.34, -0.22)] {
    parts.append(StarterPart(name: name, center: SIMD3(x, -0.34, z), radius: SIMD3(0.15, 0.15, 0.07),
                             rotation: SIMD3(1.5708, 0, 0), rings: 8, segments: 14, material: dark,
                             primitive: .cylinder))
  }
  return parts
}

/// Round abdomen, smaller head, and eight legs splayed in pairs.
private func spider(body: Int, dark: Int, eye: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Abdomen", center: SIMD3(-0.10, 0.02, 0), radius: SIMD3(0.30, 0.26, 0.28),
                           rotation: SIMD3(0, 0, 0), rings: 10, segments: 16, material: body))
  parts.append(StarterPart(name: "Head", center: SIMD3(0.24, -0.02, 0), radius: SIMD3(0.18, 0.16, 0.17),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 14, material: body))
  parts.append(StarterPart(name: "EyeLeft", center: SIMD3(0.36, 0.05, 0.08), radius: SIMD3(0.05, 0.05, 0.05),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: eye))
  parts.append(StarterPart(name: "EyeRight", center: SIMD3(0.36, 0.05, -0.08), radius: SIMD3(0.05, 0.05, 0.05),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: eye))
  for i in 0..<4 {
    let x = 0.16 - Float(i) * 0.14
    let lift = Float(i % 2 == 0 ? 0.04 : 0.0)
    parts.append(StarterPart(name: "LegLeft\(i)", center: SIMD3(x, -0.20 + lift, 0.30),
                             radius: SIMD3(0.035, 0.30, 0.035), rotation: SIMD3(-0.9, 0, 0.25),
                             rings: 5, segments: 8, material: dark, primitive: .cylinder))
    parts.append(StarterPart(name: "LegRight\(i)", center: SIMD3(x, -0.20 + lift, -0.30),
                             radius: SIMD3(0.035, 0.30, 0.035), rotation: SIMD3(0.9, 0, 0.25),
                             rings: 5, segments: 8, material: dark, primitive: .cylinder))
  }
  return parts
}

/// Wide flat shell, two raised claws, stalk eyes and short legs.
private func crab(shell: Int, dark: Int, eye: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Shell", center: SIMD3(0, -0.02, 0), radius: SIMD3(0.44, 0.20, 0.32),
                           rotation: SIMD3(0, 0, 0), rings: 10, segments: 18, material: shell))
  for (side, z) in [("Left", Float(0.34)), ("Right", -0.34)] {
    parts.append(StarterPart(name: "Arm\(side)", center: SIMD3(0.26, 0.02, z * 0.9),
                             radius: SIMD3(0.05, 0.16, 0.05), rotation: SIMD3(0, 0, -0.6),
                             rings: 5, segments: 8, material: shell, primitive: .cylinder))
    parts.append(StarterPart(name: "Claw\(side)", center: SIMD3(0.42, 0.16, z),
                             radius: SIMD3(0.15, 0.13, 0.10), rotation: SIMD3(0, 0, 0.3),
                             rings: 8, segments: 12, material: shell))
    parts.append(StarterPart(name: "EyeStalk\(side)", center: SIMD3(0.12, 0.22, z * 0.35),
                             radius: SIMD3(0.03, 0.12, 0.03), rotation: SIMD3(0, 0, 0),
                             rings: 5, segments: 8, material: dark, primitive: .cylinder))
    parts.append(StarterPart(name: "Eye\(side)", center: SIMD3(0.12, 0.34, z * 0.35),
                             radius: SIMD3(0.06, 0.06, 0.06), rotation: SIMD3(0, 0, 0),
                             rings: 6, segments: 10, material: eye))
  }
  for i in 0..<3 {
    let x = -0.02 - Float(i) * 0.15
    parts.append(StarterPart(name: "LegLeft\(i)", center: SIMD3(x, -0.24, 0.32),
                             radius: SIMD3(0.03, 0.17, 0.03), rotation: SIMD3(-0.7, 0, 0),
                             rings: 5, segments: 8, material: dark, primitive: .cylinder))
    parts.append(StarterPart(name: "LegRight\(i)", center: SIMD3(x, -0.24, -0.32),
                             radius: SIMD3(0.03, 0.17, 0.03), rotation: SIMD3(0.7, 0, 0),
                             rings: 5, segments: 8, material: dark, primitive: .cylinder))
  }
  return parts
}

/// Slim body with four broad wings — the wings are the whole silhouette.
private func butterfly(wing: Int, body: Int, accent: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Body", center: SIMD3(0, 0, 0), radius: SIMD3(0.06, 0.34, 0.06),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 12, material: body))
  parts.append(StarterPart(name: "Head", center: SIMD3(0, 0.36, 0), radius: SIMD3(0.09, 0.09, 0.09),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 12, material: body))
  for (side, z) in [("Left", Float(1)), ("Right", Float(-1))] {
    parts.append(StarterPart(name: "UpperWing\(side)", center: SIMD3(0, 0.16, z * 0.30),
                             radius: SIMD3(0.03, 0.24, 0.30), rotation: SIMD3(z * 0.25, 0, 0),
                             rings: 8, segments: 14, material: wing))
    parts.append(StarterPart(name: "LowerWing\(side)", center: SIMD3(0, -0.16, z * 0.24),
                             radius: SIMD3(0.03, 0.18, 0.23), rotation: SIMD3(z * 0.25, 0, 0),
                             rings: 8, segments: 14, material: accent))
    parts.append(StarterPart(name: "Antenna\(side)", center: SIMD3(0, 0.50, z * 0.08),
                             radius: SIMD3(0.015, 0.12, 0.015), rotation: SIMD3(z * 0.4, 0, 0),
                             rings: 4, segments: 6, material: body, primitive: .cylinder))
  }
  return parts
}

/// Bee: fat striped abdomen, distinct head, and wings that stand off the body.
/// The first attempt rendered as a pale blob — the stripes were wide cylinders
/// that blended, and the wings lay flat along the back where they vanished.
private func bee(body: Int, dark: Int, wing: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Abdomen", center: SIMD3(-0.12, 0, 0), radius: SIMD3(0.34, 0.24, 0.24),
                           rotation: SIMD3(0, 0, 0), rings: 10, segments: 16, material: body))
  // Narrow bands sitting proud of the abdomen so they read as stripes.
  for i in 0..<3 {
    let x = 0.04 - Float(i) * 0.16
    parts.append(StarterPart(name: "Stripe\(i)", center: SIMD3(x, 0, 0),
                             radius: SIMD3(0.045, 0.25, 0.25), rotation: SIMD3(0, 0, 1.5708),
                             rings: 6, segments: 14, material: dark, primitive: .cylinder))
  }
  parts.append(StarterPart(name: "Head", center: SIMD3(0.32, 0.04, 0), radius: SIMD3(0.17, 0.17, 0.17),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 14, material: dark))
  parts.append(StarterPart(name: "EyeLeft", center: SIMD3(0.44, 0.08, 0.09), radius: SIMD3(0.05, 0.05, 0.04),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: wing))
  parts.append(StarterPart(name: "EyeRight", center: SIMD3(0.44, 0.08, -0.09), radius: SIMD3(0.05, 0.05, 0.04),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: wing))
  parts.append(StarterPart(name: "Stinger", center: SIMD3(-0.50, 0, 0), radius: SIMD3(0.07, 0.13, 0.07),
                           rotation: SIMD3(0, 0, 1.5708), rings: 5, segments: 8, material: dark,
                           primitive: .cone))
  for (side, z) in [("Left", Float(1)), ("Right", Float(-1))] {
    parts.append(StarterPart(name: "Wing\(side)", center: SIMD3(-0.04, 0.30, z * 0.24),
                             radius: SIMD3(0.20, 0.04, 0.26), rotation: SIMD3(z * 0.55, 0, 0),
                             rings: 6, segments: 12, material: wing))
  }
  return parts
}

/// Snake: a long thin tube coiled on the ground.
/// Attempts one and two read as a caterpillar because the segments alternated
/// colour (banding turns a tube into beads). Attempt three fixed the colour but
/// kept a big pale belly ellipsoid underneath, which read as a blob the animal
/// was sitting on. This drops the belly entirely and doubles the length: a
/// snake is mostly body, and it has to be long before it reads as one.
private func snake(body: Int, belly: Int, eye: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  // 26 overlapping segments spiralling inward, thin relative to their length.
  for i in 0..<26 {
    let t = Float(i)
    let r = 0.115 - t * 0.0026
    let a = t * 0.40
    let radius = 0.46 - t * 0.014
    parts.append(StarterPart(name: "Segment\(i)",
                             center: SIMD3(cos(a) * radius, -0.30 + t * 0.004, sin(a) * radius),
                             radius: SIMD3(r, r * 0.9, r),
                             rotation: SIMD3(0, 0, 0), rings: 8, segments: 12,
                             material: i > 20 ? belly : body))
  }
  parts.append(StarterPart(name: "Head", center: SIMD3(0.52, -0.24, 0.06), radius: SIMD3(0.17, 0.12, 0.15),
                           rotation: SIMD3(0, -0.9, 0), rings: 10, segments: 14, material: body))
  parts.append(StarterPart(name: "Snout", center: SIMD3(0.60, -0.25, 0.20), radius: SIMD3(0.09, 0.08, 0.09),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 12, material: body))
  parts.append(StarterPart(name: "EyeLeft", center: SIMD3(0.58, -0.15, 0.13), radius: SIMD3(0.04, 0.04, 0.04),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: eye))
  parts.append(StarterPart(name: "EyeRight", center: SIMD3(0.48, -0.15, 0.01), radius: SIMD3(0.04, 0.04, 0.04),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: eye))
  return parts
}

/// Squat body, eyes riding on top of the head, folded legs.
private func frog(body: Int, belly: Int, eye: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Body", center: SIMD3(0, -0.10, 0), radius: SIMD3(0.34, 0.26, 0.32),
                           rotation: SIMD3(0, 0, 0), rings: 10, segments: 16, material: body))
  parts.append(StarterPart(name: "Belly", center: SIMD3(0.06, -0.18, 0), radius: SIMD3(0.24, 0.16, 0.24),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 14, material: belly))
  for (side, z) in [("Left", Float(1)), ("Right", Float(-1))] {
    parts.append(StarterPart(name: "EyeBump\(side)", center: SIMD3(0.10, 0.18, z * 0.15),
                             radius: SIMD3(0.11, 0.11, 0.11), rotation: SIMD3(0, 0, 0),
                             rings: 8, segments: 12, material: body))
    parts.append(StarterPart(name: "Eye\(side)", center: SIMD3(0.16, 0.23, z * 0.15),
                             radius: SIMD3(0.06, 0.06, 0.06), rotation: SIMD3(0, 0, 0),
                             rings: 6, segments: 10, material: eye))
    parts.append(StarterPart(name: "BackLeg\(side)", center: SIMD3(-0.22, -0.26, z * 0.30),
                             radius: SIMD3(0.15, 0.10, 0.09), rotation: SIMD3(0, 0, 0.3),
                             rings: 6, segments: 12, material: body))
    parts.append(StarterPart(name: "FrontFoot\(side)", center: SIMD3(0.26, -0.32, z * 0.20),
                             radius: SIMD3(0.11, 0.06, 0.08), rotation: SIMD3(0, 0, 0),
                             rings: 6, segments: 10, material: body))
  }
  return parts
}

/// Domed shell over a flatter underside, with head and four stubby legs.
private func turtle(shell: Int, skin: Int, eye: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Shell", center: SIMD3(0, 0, 0), radius: SIMD3(0.40, 0.26, 0.34),
                           rotation: SIMD3(0, 0, 0), rings: 10, segments: 18, material: shell))
  parts.append(StarterPart(name: "Underside", center: SIMD3(0, -0.14, 0), radius: SIMD3(0.36, 0.10, 0.30),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 16, material: skin))
  parts.append(StarterPart(name: "Head", center: SIMD3(0.44, -0.02, 0), radius: SIMD3(0.16, 0.14, 0.14),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 14, material: skin))
  parts.append(StarterPart(name: "EyeLeft", center: SIMD3(0.54, 0.04, 0.07), radius: SIMD3(0.035, 0.035, 0.035),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: eye))
  parts.append(StarterPart(name: "EyeRight", center: SIMD3(0.54, 0.04, -0.07), radius: SIMD3(0.035, 0.035, 0.035),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: eye))
  parts.append(StarterPart(name: "Tail", center: SIMD3(-0.42, -0.06, 0), radius: SIMD3(0.10, 0.06, 0.06),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: skin))
  for (name, x, z) in [("LegFrontLeft", Float(0.22), Float(0.30)), ("LegFrontRight", 0.22, -0.30),
                       ("LegBackLeft", -0.22, 0.30), ("LegBackRight", -0.22, -0.30)] {
    parts.append(StarterPart(name: name, center: SIMD3(x, -0.20, z), radius: SIMD3(0.11, 0.08, 0.09),
                             rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: skin))
  }
  return parts
}

/// Bell dome with trailing tentacles.
private func jellyfish(bell: Int, tentacle: Int, eye: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Bell", center: SIMD3(0, 0.24, 0), radius: SIMD3(0.38, 0.30, 0.38),
                           rotation: SIMD3(0, 0, 0), rings: 12, segments: 18, material: bell))
  parts.append(StarterPart(name: "Rim", center: SIMD3(0, 0.04, 0), radius: SIMD3(0.34, 0.08, 0.34),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 16, material: tentacle))
  parts.append(StarterPart(name: "EyeLeft", center: SIMD3(0.12, 0.24, 0.32), radius: SIMD3(0.05, 0.05, 0.04),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: eye))
  parts.append(StarterPart(name: "EyeRight", center: SIMD3(-0.12, 0.24, 0.32), radius: SIMD3(0.05, 0.05, 0.04),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: eye))
  for i in 0..<6 {
    let a = Float(i) * 1.0472
    parts.append(StarterPart(name: "Tentacle\(i)",
                             center: SIMD3(cos(a) * 0.20, -0.26, sin(a) * 0.20),
                             radius: SIMD3(0.035, 0.28, 0.035),
                             rotation: SIMD3(sin(a) * 0.25, 0, cos(a) * -0.25),
                             rings: 6, segments: 8, material: tentacle, primitive: .cylinder))
  }
  return parts
}

/// Spiral shell built from shrinking stacked ellipsoids, plus body and eye stalks.
private func snail(shell: Int, bodyMat: Int, eye: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Foot", center: SIMD3(0.02, -0.34, 0), radius: SIMD3(0.44, 0.12, 0.20),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 16, material: bodyMat))
  parts.append(StarterPart(name: "Head", center: SIMD3(0.40, -0.20, 0), radius: SIMD3(0.16, 0.14, 0.14),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 12, material: bodyMat))
  for i in 0..<4 {
    let t = Float(i)
    let a = t * 1.6
    let r = 0.30 - t * 0.06
    parts.append(StarterPart(name: "Shell\(i)",
                             center: SIMD3(-0.06 + cos(a) * (0.12 - t * 0.02), 0.06 + sin(a) * (0.12 - t * 0.02), 0),
                             radius: SIMD3(r, r, r * 0.62),
                             rotation: SIMD3(0, 0, 0), rings: 10, segments: 14, material: shell))
  }
  for (side, z) in [("Left", Float(1)), ("Right", Float(-1))] {
    parts.append(StarterPart(name: "Stalk\(side)", center: SIMD3(0.46, -0.04, z * 0.07),
                             radius: SIMD3(0.025, 0.14, 0.025), rotation: SIMD3(z * 0.2, 0, -0.2),
                             rings: 5, segments: 8, material: bodyMat, primitive: .cylinder))
    parts.append(StarterPart(name: "Eye\(side)", center: SIMD3(0.52, 0.10, z * 0.09),
                             radius: SIMD3(0.05, 0.05, 0.05), rotation: SIMD3(0, 0, 0),
                             rings: 6, segments: 10, material: eye))
  }
  return parts
}

/// Walls, pitched roof, door and chimney.
private func house(walls: Int, roof: Int, trim: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Walls", center: SIMD3(0, -0.18, 0), radius: SIMD3(0.38, 0.28, 0.34),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 4, material: walls,
                           primitive: .cylinder))
  parts.append(StarterPart(name: "Roof", center: SIMD3(0, 0.28, 0), radius: SIMD3(0.50, 0.30, 0.46),
                           rotation: SIMD3(0, 0.7854, 0), rings: 6, segments: 4, material: roof,
                           primitive: .cone))
  parts.append(StarterPart(name: "Door", center: SIMD3(0.30, -0.28, 0), radius: SIMD3(0.10, 0.16, 0.10),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 8, material: trim))
  parts.append(StarterPart(name: "Chimney", center: SIMD3(-0.20, 0.40, 0.12), radius: SIMD3(0.07, 0.18, 0.07),
                           rotation: SIMD3(0, 0, 0), rings: 5, segments: 8, material: trim,
                           primitive: .cylinder))
  return parts
}

/// Castle: a squat wide keep, not a spire.
/// The first attempt was tall and narrow enough to read as a pencil or a
/// rocket. Wider than it is tall now, with battlements that overhang.
private func castle(stone: Int, roof: Int, trim: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Keep", center: SIMD3(0, -0.16, 0), radius: SIMD3(0.40, 0.32, 0.40),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 16, material: stone,
                           primitive: .cylinder))
  parts.append(StarterPart(name: "Battlement", center: SIMD3(0, 0.20, 0), radius: SIMD3(0.47, 0.08, 0.47),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 16, material: stone,
                           primitive: .cylinder))
  for i in 0..<8 {
    let a = Float(i) * 0.7854
    parts.append(StarterPart(name: "Merlon\(i)", center: SIMD3(cos(a) * 0.41, 0.33, sin(a) * 0.41),
                             radius: SIMD3(0.075, 0.10, 0.075), rotation: SIMD3(0, 0, 0),
                             rings: 4, segments: 6, material: stone, primitive: .cylinder))
  }
  parts.append(StarterPart(name: "Turret", center: SIMD3(0, 0.34, 0), radius: SIMD3(0.20, 0.16, 0.20),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 14, material: stone,
                           primitive: .cylinder))
  parts.append(StarterPart(name: "Roof", center: SIMD3(0, 0.62, 0), radius: SIMD3(0.26, 0.26, 0.26),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 14, material: roof,
                           primitive: .cone))
  parts.append(StarterPart(name: "Gate", center: SIMD3(0.38, -0.30, 0), radius: SIMD3(0.10, 0.17, 0.13),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: trim))
  return parts
}

/// Stem and a spotted cap.
private func mushroom(cap: Int, stem: Int, spot: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Stem", center: SIMD3(0, -0.22, 0), radius: SIMD3(0.16, 0.28, 0.16),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 14, material: stem,
                           primitive: .cylinder))
  parts.append(StarterPart(name: "Cap", center: SIMD3(0, 0.16, 0), radius: SIMD3(0.44, 0.32, 0.44),
                           rotation: SIMD3(0, 0, 0), rings: 12, segments: 18, material: cap))
  for i in 0..<4 {
    let a = Float(i) * 1.5708 + 0.4
    parts.append(StarterPart(name: "Spot\(i)",
                             center: SIMD3(cos(a) * 0.24, 0.32, sin(a) * 0.24),
                             radius: SIMD3(0.10, 0.06, 0.10), rotation: SIMD3(0, 0, 0),
                             rings: 6, segments: 10, material: spot))
  }
  return parts
}

/// Stem, leaves, centre and radial petals.
private func flower(petal: Int, centre: Int, stem: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Stem", center: SIMD3(0, -0.28, 0), radius: SIMD3(0.04, 0.30, 0.04),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: stem,
                           primitive: .cylinder))
  parts.append(StarterPart(name: "LeafLeft", center: SIMD3(0.16, -0.24, 0), radius: SIMD3(0.16, 0.05, 0.08),
                           rotation: SIMD3(0, 0, 0.4), rings: 6, segments: 10, material: stem))
  parts.append(StarterPart(name: "LeafRight", center: SIMD3(-0.16, -0.34, 0), radius: SIMD3(0.14, 0.05, 0.07),
                           rotation: SIMD3(0, 0, -0.4), rings: 6, segments: 10, material: stem))
  parts.append(StarterPart(name: "Centre", center: SIMD3(0, 0.22, 0), radius: SIMD3(0.15, 0.14, 0.12),
                           rotation: SIMD3(0, 0, 0), rings: 8, segments: 14, material: centre))
  for i in 0..<6 {
    let a = Float(i) * 1.0472
    parts.append(StarterPart(name: "Petal\(i)",
                             center: SIMD3(cos(a) * 0.28, 0.22, sin(a) * 0.28),
                             radius: SIMD3(0.16, 0.07, 0.16), rotation: SIMD3(0, -a, 0),
                             rings: 6, segments: 12, material: petal))
  }
  return parts
}

/// Five-pointed star: a small core with cones radiating in a ring.
private func star(bodyMat: Int, glow: Int, eye: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  parts.append(StarterPart(name: "Core", center: SIMD3(0, 0, 0), radius: SIMD3(0.22, 0.22, 0.12),
                           rotation: SIMD3(0, 0, 0), rings: 10, segments: 16, material: bodyMat))
  for i in 0..<5 {
    let a = Float(i) * 1.2566 + 1.5708
    parts.append(StarterPart(name: "Point\(i)",
                             center: SIMD3(cos(a) * 0.34, sin(a) * 0.34, 0),
                             radius: SIMD3(0.13, 0.26, 0.10),
                             rotation: SIMD3(0, 0, a - 1.5708),
                             rings: 6, segments: 8, material: glow, primitive: .cone))
  }
  parts.append(StarterPart(name: "EyeLeft", center: SIMD3(0.08, 0.04, 0.11), radius: SIMD3(0.04, 0.04, 0.03),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: eye))
  parts.append(StarterPart(name: "EyeRight", center: SIMD3(-0.08, 0.04, 0.11), radius: SIMD3(0.04, 0.04, 0.03),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: eye))
  return parts
}

/// Treasure chest: boxy base with a clearly separated barrel lid.
/// The first attempt merged the lid into the base and hid the banding inside
/// the body, so it rendered as an anonymous brown lump.
private func chest(wood: Int, metal: Int, gold: Int) -> [StarterPart] {
  var parts: [StarterPart] = []
  // 4-segment cylinders are boxes, which is what gives the chest hard corners.
  parts.append(StarterPart(name: "Base", center: SIMD3(0, -0.28, 0), radius: SIMD3(0.46, 0.22, 0.32),
                           rotation: SIMD3(0, 0.7854, 0), rings: 6, segments: 4, material: wood,
                           primitive: .cylinder))
  parts.append(StarterPart(name: "Rim", center: SIMD3(0, -0.05, 0), radius: SIMD3(0.48, 0.04, 0.34),
                           rotation: SIMD3(0, 0.7854, 0), rings: 4, segments: 4, material: gold,
                           primitive: .cylinder))
  // Half-barrel lid, lifted clear of the rim so the join is visible.
  parts.append(StarterPart(name: "Lid", center: SIMD3(0, 0.02, 0), radius: SIMD3(0.44, 0.30, 0.30),
                           rotation: SIMD3(1.5708, 0, 0), rings: 8, segments: 12, material: wood,
                           primitive: .cylinder))
  for (side, x) in [("Left", Float(0.26)), ("Right", Float(-0.26))] {
    parts.append(StarterPart(name: "Band\(side)", center: SIMD3(x, -0.02, 0),
                             radius: SIMD3(0.045, 0.34, 0.345), rotation: SIMD3(1.5708, 0, 0),
                             rings: 6, segments: 12, material: metal, primitive: .cylinder))
  }
  parts.append(StarterPart(name: "Lock", center: SIMD3(0, -0.08, 0.34), radius: SIMD3(0.09, 0.10, 0.05),
                           rotation: SIMD3(0, 0, 0), rings: 6, segments: 10, material: gold))
  return parts
}

func starterCatalog() -> [StarterCharacter] {
  [
    // Quadrupeds — share the quadruped() template (body + neck + head + snout +
    // 4 legs + tail), with per-character horns/ears/proportions.
    StarterCharacter(
      id: "dinosaur", displayName: "Dinosaur", description: "A friendly toy dinosaur.",
      aliases: ["dino"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Dinosaur Green", color: SIMD4(0.12, 0.55, 0.22, 1), metallic: 0.35, roughness: 0.55),
        FACE_DARK,
      ],
      parts: quadruped(body: 0, face: 1, bodyScale: SIMD3(1.35, 1.1, 0.95), headScale: 1.1)
    ),
    StarterCharacter(
      id: "unicorn", displayName: "Unicorn", description: "A bright magical toy unicorn.",
      aliases: ["pony"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Unicorn Pearl", color: SIMD4(0.9, 0.72, 0.88, 1), metallic: 0.25, roughness: 0.5),
        StarterMaterial(name: "Unicorn Horn Gold", color: SIMD4(0.95, 0.75, 0.15, 1), metallic: 0.85, roughness: 0.18),
        FACE_DARK,
      ],
      parts: quadruped(body: 0, accent: 1, face: 2, bodyScale: SIMD3(1.2, 1.1, 0.9), hasHorn: true, hasEars: true)
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
        FACE_DARK,
      ],
      parts: humanoid(body: 0, accent: 1, face: 2, hat: .helmet, bodyScale: SIMD3(1.05, 1, 1.05))
    ),
    StarterCharacter(
      id: "knight", displayName: "Knight", description: "A brave armored toy knight.",
      aliases: ["warrior"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Knight Steel", color: SIMD4(0.42, 0.48, 0.58, 1), metallic: 0.7, roughness: 0.35),
        StarterMaterial(name: "Knight Trim", color: SIMD4(0.15, 0.18, 0.22, 1), metallic: 0.6, roughness: 0.4),
        FACE_DARK,
      ],
      parts: humanoid(body: 0, accent: 1, face: 2, hat: .helmet, bodyScale: SIMD3(1.05, 1, 1.02))
    ),
    StarterCharacter(
      id: "wizard", displayName: "Wizard", description: "A wise toy wizard.",
      aliases: ["mage"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Wizard Violet", color: SIMD4(0.38, 0.16, 0.66, 1), metallic: 0.15, roughness: 0.65),
        StarterMaterial(name: "Wizard Hat", color: SIMD4(0.15, 0.08, 0.32, 1), metallic: 0.2, roughness: 0.55),
        FACE_DARK,
      ],
      parts: humanoid(body: 0, accent: 1, face: 2, hat: .wizardHat, robe: true)
    ),
    StarterCharacter(
      id: "princess", displayName: "Princess", description: "A royal toy adventurer.",
      aliases: ["royal"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Princess Rose", color: SIMD4(0.86, 0.3, 0.58, 1), metallic: 0.2, roughness: 0.5),
        StarterMaterial(name: "Princess Gold", color: SIMD4(0.95, 0.75, 0.15, 1), metallic: 0.85, roughness: 0.18),
        FACE_DARK,
      ],
      parts: humanoid(body: 0, accent: 1, face: 2, hat: .crown, robe: true)
    ),
    StarterCharacter(
      id: "astronaut", displayName: "Astronaut", description: "A space-exploring toy astronaut.",
      aliases: ["space explorer"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Astronaut White", color: SIMD4(0.82, 0.86, 0.9, 1), metallic: 0.25, roughness: 0.4),
        StarterMaterial(name: "Astronaut Visor", color: SIMD4(0.15, 0.28, 0.5, 1), metallic: 0.9, roughness: 0.12),
        FACE_DARK,
      ],
      parts: humanoid(body: 0, accent: 1, face: 2, hat: .helmet)
    ),
    StarterCharacter(
      id: "ninja", displayName: "Ninja", description: "A quick and quiet toy ninja.",
      aliases: ["shinobi"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Ninja Charcoal", color: SIMD4(0.06, 0.07, 0.09, 1), metallic: 0.2, roughness: 0.7),
        FACE_LIGHT,  // white eyes so they show against the near-black body
      ],
      parts: humanoid(body: 0, face: 1, bodyScale: SIMD3(0.9, 1, 0.9))
    ),
    StarterCharacter(
      id: "puppy", displayName: "Puppy", description: "A playful toy puppy.",
      aliases: ["pup"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Puppy Gold", color: SIMD4(0.68, 0.4, 0.16, 1), metallic: 0.35, roughness: 0.55),
        FACE_DARK,
      ],
      parts: quadruped(body: 0, face: 1, bodyScale: SIMD3(0.9, 0.8, 0.8), headScale: 1.15, hasEars: true)
    ),
    StarterCharacter(
      id: "superhero", displayName: "Superhero", description: "A soaring toy superhero.",
      aliases: ["hero"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Hero Blue", color: SIMD4(0.05, 0.24, 0.72, 1), metallic: 0.2, roughness: 0.5),
        StarterMaterial(name: "Hero Cape Red", color: SIMD4(0.75, 0.12, 0.14, 1), metallic: 0.15, roughness: 0.55),
        FACE_DARK,
      ],
      parts: humanoid(body: 0, accent: 1, face: 2, cape: true, bodyScale: SIMD3(1.02, 1, 1.02))
    ),
    StarterCharacter(
      id: "hero", displayName: "Hero", description: "A plucky toy adventurer.",
      aliases: ["protagonist", "main character", "player"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Hero Denim", color: SIMD4(0.20, 0.38, 0.72, 1), metallic: 0.15, roughness: 0.6),
        StarterMaterial(name: "Hero Dark Trim", color: SIMD4(0.09, 0.13, 0.24, 1), metallic: 0.25, roughness: 0.5),
        StarterMaterial(name: "Hero Star Gold", color: SIMD4(0.98, 0.78, 0.18, 1), metallic: 0.85, roughness: 0.18),
      ],
      parts: hero(body: 0, dark: 1, emblem: 2)
    ),
    // Animals — Dog & Cat use the quadruped() template with different palettes;
    // Fish and Bird have their own dedicated templates (see fish() and bird()).
    StarterCharacter(
      id: "dog", displayName: "Dog", description: "A loyal toy dog.",
      aliases: ["hound", "canine", "doggy"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Dog Brown", color: SIMD4(0.55, 0.34, 0.18, 1), metallic: 0.35, roughness: 0.55),
        FACE_DARK,
      ],
      parts: quadruped(body: 0, face: 1, bodyScale: SIMD3(1.05, 0.85, 0.85), headScale: 1.05, hasEars: true)
    ),
    StarterCharacter(
      id: "cat", displayName: "Cat", description: "A sneaky toy cat.",
      aliases: ["kitten", "kitty", "feline"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Cat Orange", color: SIMD4(0.92, 0.42, 0.10, 1), metallic: 0.35, roughness: 0.55),
        FACE_DARK,
      ],
      parts: quadruped(body: 0, face: 1, bodyScale: SIMD3(0.95, 0.75, 0.75), headScale: 1.1, hasEars: true)
    ),
    StarterCharacter(
      id: "fish", displayName: "Fish", description: "A tiny toy fish.",
      aliases: ["minnow", "guppy", "goldfish", "trout"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Fish Blue", color: SIMD4(0.30, 0.55, 0.92, 1), metallic: 0.35, roughness: 0.4),
        StarterMaterial(name: "Fish Fin", color: SIMD4(0.16, 0.32, 0.68, 1), metallic: 0.3, roughness: 0.45),
        FACE_DARK,
      ],
      parts: fish(body: 0, accent: 1, face: 2)
    ),
    StarterCharacter(
      id: "bird", displayName: "Bird", description: "A small toy bird.",
      aliases: ["sparrow", "robin", "chick", "chirper"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Bird Sky Blue", color: SIMD4(0.42, 0.72, 0.95, 1), metallic: 0.2, roughness: 0.55),
        StarterMaterial(name: "Bird Beak", color: SIMD4(0.95, 0.68, 0.15, 1), metallic: 0.4, roughness: 0.35),
        FACE_DARK,
      ],
      parts: bird(body: 0, beak: 1, face: 2)
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
    // --- Expanded roster. Each reuses an existing template and varies only by
    // palette, proportion and accessories, so the whole cast still reads as one
    // family in the picker rather than 39 unrelated silhouettes. ---
    StarterCharacter(
      id: "pirate", displayName: "Pirate", description: "A daring toy pirate.",
      aliases: ["buccaneer", "captain"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Pirate Coat", color: SIMD4(0.55, 0.15, 0.18, 1), metallic: 0.2, roughness: 0.6),
        StarterMaterial(name: "Pirate Trim", color: SIMD4(0.92, 0.82, 0.35, 1), metallic: 0.75, roughness: 0.25),
        FACE_DARK,
      ],
      parts: humanoid(body: 0, accent: 1, face: 2, hat: .helmet, cape: true, bodyScale: SIMD3(1.05, 1, 1.02))
    ),
    StarterCharacter(
      id: "chef", displayName: "Chef", description: "A cheerful toy chef.",
      aliases: ["cook", "baker"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Chef White", color: SIMD4(0.94, 0.94, 0.92, 1), metallic: 0.05, roughness: 0.6),
        StarterMaterial(name: "Chef Red", color: SIMD4(0.75, 0.2, 0.22, 1), metallic: 0.2, roughness: 0.55),
        FACE_DARK,
      ],
      parts: humanoid(body: 0, accent: 1, face: 2, hat: .helmet, bodyScale: SIMD3(1.08, 0.98, 1.05))
    ),
    StarterCharacter(
      id: "doctor", displayName: "Doctor", description: "A kind toy doctor.",
      aliases: ["nurse", "medic"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Coat White", color: SIMD4(0.95, 0.96, 0.97, 1), metallic: 0.05, roughness: 0.55),
        StarterMaterial(name: "Scrub Teal", color: SIMD4(0.18, 0.6, 0.62, 1), metallic: 0.2, roughness: 0.5),
        FACE_DARK,
      ],
      parts: humanoid(body: 0, accent: 1, face: 2, bodyScale: SIMD3(1.02, 1, 1))
    ),
    StarterCharacter(
      id: "explorer", displayName: "Explorer", description: "A toy adventurer ready to explore.",
      aliases: ["adventurer", "scout"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Khaki", color: SIMD4(0.68, 0.6, 0.38, 1), metallic: 0.15, roughness: 0.65),
        StarterMaterial(name: "Belt Brown", color: SIMD4(0.35, 0.24, 0.15, 1), metallic: 0.25, roughness: 0.55),
        FACE_DARK,
      ],
      parts: humanoid(body: 0, accent: 1, face: 2, hat: .helmet, bodyScale: SIMD3(1.02, 1, 1))
    ),
    StarterCharacter(
      id: "queen", displayName: "Queen", description: "A regal toy queen.",
      aliases: ["ruler", "monarch"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Royal Purple", color: SIMD4(0.42, 0.2, 0.6, 1), metallic: 0.3, roughness: 0.45),
        StarterMaterial(name: "Crown Gold", color: SIMD4(0.95, 0.78, 0.2, 1), metallic: 0.9, roughness: 0.15),
        FACE_DARK,
      ],
      parts: humanoid(body: 0, accent: 1, face: 2, hat: .crown, robe: true, bodyScale: SIMD3(1, 1, 1))
    ),
    StarterCharacter(
      id: "king", displayName: "King", description: "A grand toy king.",
      aliases: ["emperor"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "King Crimson", color: SIMD4(0.6, 0.12, 0.2, 1), metallic: 0.3, roughness: 0.45),
        StarterMaterial(name: "Crown Gold", color: SIMD4(0.95, 0.78, 0.2, 1), metallic: 0.9, roughness: 0.15),
        FACE_DARK,
      ],
      parts: humanoid(body: 0, accent: 1, face: 2, hat: .crown, cape: true, bodyScale: SIMD3(1.08, 1, 1.05))
    ),
    StarterCharacter(
      id: "witch", displayName: "Witch", description: "A friendly toy witch.",
      aliases: ["sorceress"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Witch Violet", color: SIMD4(0.3, 0.16, 0.44, 1), metallic: 0.2, roughness: 0.55),
        StarterMaterial(name: "Witch Green", color: SIMD4(0.3, 0.62, 0.32, 1), metallic: 0.25, roughness: 0.5),
        FACE_DARK,
      ],
      parts: humanoid(body: 0, accent: 1, face: 2, hat: .wizardHat, robe: true, bodyScale: SIMD3(0.98, 1, 0.98))
    ),
    StarterCharacter(
      id: "diver", displayName: "Diver", description: "A toy deep-sea diver.",
      aliases: ["scuba"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Wetsuit Navy", color: SIMD4(0.12, 0.2, 0.35, 1), metallic: 0.3, roughness: 0.45),
        StarterMaterial(name: "Tank Yellow", color: SIMD4(0.95, 0.78, 0.2, 1), metallic: 0.6, roughness: 0.3),
        FACE_DARK,
      ],
      parts: humanoid(body: 0, accent: 1, face: 2, hat: .helmet, bodyScale: SIMD3(1.05, 1, 1.05))
    ),
    StarterCharacter(
      id: "bear", displayName: "Bear", description: "A cuddly toy bear.",
      aliases: ["teddy"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Bear Brown", color: SIMD4(0.45, 0.3, 0.18, 1), metallic: 0.1, roughness: 0.7),
        FACE_DARK,
      ],
      parts: quadruped(body: 0, face: 1, bodyScale: SIMD3(1.3, 1.15, 1.05), headScale: 1.15, hasEars: true)
    ),
    StarterCharacter(
      id: "rabbit", displayName: "Rabbit", description: "A hoppy toy rabbit.",
      aliases: ["bunny", "hare"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Rabbit Cream", color: SIMD4(0.92, 0.88, 0.82, 1), metallic: 0.05, roughness: 0.65),
        FACE_DARK,
      ],
      parts: quadruped(body: 0, face: 1, bodyScale: SIMD3(0.9, 0.95, 0.85), headScale: 1.05, hasEars: true)
    ),
    StarterCharacter(
      id: "fox", displayName: "Fox", description: "A clever toy fox.",
      aliases: [], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Fox Orange", color: SIMD4(0.85, 0.42, 0.14, 1), metallic: 0.15, roughness: 0.6),
        FACE_DARK,
      ],
      parts: quadruped(body: 0, face: 1, bodyScale: SIMD3(1.1, 0.9, 0.85), headScale: 1.05, hasEars: true)
    ),
    StarterCharacter(
      id: "panda", displayName: "Panda", description: "A gentle toy panda.",
      aliases: [], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Panda White", color: SIMD4(0.94, 0.94, 0.93, 1), metallic: 0.05, roughness: 0.65),
        StarterMaterial(name: "Panda Black", color: SIMD4(0.11, 0.11, 0.13, 1), metallic: 0.1, roughness: 0.6),
        FACE_DARK,
      ],
      parts: quadruped(body: 0, accent: 1, face: 2, bodyScale: SIMD3(1.25, 1.15, 1.05), headScale: 1.15, hasEars: true)
    ),
    StarterCharacter(
      id: "tiger", displayName: "Tiger", description: "A bold toy tiger.",
      aliases: ["lion", "cub"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Tiger Orange", color: SIMD4(0.9, 0.5, 0.12, 1), metallic: 0.15, roughness: 0.6),
        StarterMaterial(name: "Tiger Stripe", color: SIMD4(0.15, 0.12, 0.1, 1), metallic: 0.2, roughness: 0.55),
        FACE_DARK,
      ],
      parts: quadruped(body: 0, accent: 1, face: 2, bodyScale: SIMD3(1.25, 1.0, 0.95), headScale: 1.1, hasEars: true)
    ),
    StarterCharacter(
      id: "penguin", displayName: "Penguin", description: "A waddling toy penguin.",
      aliases: [], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Penguin Black", color: SIMD4(0.13, 0.15, 0.2, 1), metallic: 0.15, roughness: 0.55),
        StarterMaterial(name: "Penguin Beak", color: SIMD4(0.95, 0.65, 0.15, 1), metallic: 0.35, roughness: 0.4),
        FACE_DARK,
      ],
      parts: bird(body: 0, beak: 1, face: 2, bodyScale: SIMD3(1.1, 1.2, 1.1))
    ),
    StarterCharacter(
      id: "owl", displayName: "Owl", description: "A wise toy owl.",
      aliases: [], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Owl Brown", color: SIMD4(0.52, 0.38, 0.24, 1), metallic: 0.1, roughness: 0.65),
        StarterMaterial(name: "Owl Beak", color: SIMD4(0.9, 0.72, 0.25, 1), metallic: 0.4, roughness: 0.35),
        FACE_DARK,
      ],
      parts: bird(body: 0, beak: 1, face: 2, bodyScale: SIMD3(1.15, 1.05, 1.15))
    ),
    StarterCharacter(
      id: "parrot", displayName: "Parrot", description: "A colourful toy parrot.",
      aliases: ["macaw"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Parrot Red", color: SIMD4(0.85, 0.18, 0.18, 1), metallic: 0.2, roughness: 0.5),
        StarterMaterial(name: "Parrot Beak", color: SIMD4(0.25, 0.25, 0.28, 1), metallic: 0.4, roughness: 0.4),
        FACE_DARK,
      ],
      parts: bird(body: 0, beak: 1, face: 2, bodyScale: SIMD3(0.95, 1.05, 0.95))
    ),
    StarterCharacter(
      id: "shark", displayName: "Shark", description: "A toothy toy shark.",
      aliases: [], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Shark Grey", color: SIMD4(0.42, 0.48, 0.55, 1), metallic: 0.3, roughness: 0.45),
        FACE_DARK,
      ],
      parts: fish(body: 0, face: 1, bodyScale: SIMD3(1.5, 1.0, 0.9))
    ),
    StarterCharacter(
      id: "octopus", displayName: "Octopus", description: "A curious toy octopus.",
      aliases: ["squid"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Octopus Purple", color: SIMD4(0.62, 0.3, 0.66, 1), metallic: 0.2, roughness: 0.5),
        FACE_DARK,
      ],
      parts: fish(body: 0, face: 1, bodyScale: SIMD3(1.0, 1.15, 1.0))
    ),
    // Vehicles, small creatures and props — the twenty archetypes added to
    // break the humanoid/quadruped monotony of the original roster.
    StarterCharacter(
      id: "car", displayName: "Car", description: "A little racing car.",
      aliases: ["vehicle", "racer", "automobile"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Car Red", color: SIMD4(0.85, 0.18, 0.20, 1), metallic: 0.55, roughness: 0.35),
        StarterMaterial(name: "Tyre Black", color: SIMD4(0.10, 0.10, 0.12, 1), metallic: 0.15, roughness: 0.75),
        StarterMaterial(name: "Glass Blue", color: SIMD4(0.55, 0.78, 0.92, 1), metallic: 0.30, roughness: 0.20),
      ],
      parts: car(body: 0, dark: 1, glass: 2)
    ),
    StarterCharacter(
      id: "rocket", displayName: "Rocket", description: "A spaceship ready for launch.",
      aliases: ["spaceship", "spacecraft", "launch"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Rocket White", color: SIMD4(0.92, 0.93, 0.96, 1), metallic: 0.45, roughness: 0.35),
        StarterMaterial(name: "Rocket Red", color: SIMD4(0.86, 0.22, 0.18, 1), metallic: 0.45, roughness: 0.35),
        StarterMaterial(name: "Flame", color: SIMD4(0.98, 0.66, 0.15, 1), metallic: 0.20, roughness: 0.40),
      ],
      parts: rocket(body: 0, accent: 1, flame: 2)
    ),
    StarterCharacter(
      id: "boat", displayName: "Boat", description: "A little sailing boat.",
      aliases: ["ship", "sailboat", "yacht"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Hull Wood", color: SIMD4(0.55, 0.33, 0.18, 1), metallic: 0.20, roughness: 0.65),
        StarterMaterial(name: "Sail White", color: SIMD4(0.95, 0.95, 0.92, 1), metallic: 0.10, roughness: 0.60),
        StarterMaterial(name: "Mast Brown", color: SIMD4(0.36, 0.24, 0.14, 1), metallic: 0.20, roughness: 0.70),
      ],
      parts: boat(hull: 0, sail: 1, mast: 2)
    ),
    StarterCharacter(
      id: "airplane", displayName: "Airplane", description: "A propeller plane.",
      aliases: ["plane", "aeroplane", "jet", "flying"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Plane Blue", color: SIMD4(0.22, 0.48, 0.85, 1), metallic: 0.50, roughness: 0.35),
        StarterMaterial(name: "Wing White", color: SIMD4(0.93, 0.94, 0.96, 1), metallic: 0.45, roughness: 0.35),
        StarterMaterial(name: "Plane Dark", color: SIMD4(0.16, 0.18, 0.24, 1), metallic: 0.35, roughness: 0.45),
      ],
      parts: airplane(body: 0, wing: 1, dark: 2)
    ),
    StarterCharacter(
      id: "train", displayName: "Train", description: "A steam engine.",
      aliases: ["locomotive", "steam engine", "railway"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Engine Green", color: SIMD4(0.14, 0.45, 0.30, 1), metallic: 0.50, roughness: 0.40),
        StarterMaterial(name: "Iron Dark", color: SIMD4(0.13, 0.13, 0.15, 1), metallic: 0.55, roughness: 0.45),
        StarterMaterial(name: "Cab Red", color: SIMD4(0.72, 0.20, 0.18, 1), metallic: 0.40, roughness: 0.45),
      ],
      parts: train(body: 0, dark: 1, accent: 2)
    ),
    StarterCharacter(
      id: "spider", displayName: "Spider", description: "An eight-legged spider.",
      aliases: ["bug", "arachnid", "creepy"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Spider Body", color: SIMD4(0.24, 0.16, 0.32, 1), metallic: 0.30, roughness: 0.50),
        StarterMaterial(name: "Leg Dark", color: SIMD4(0.12, 0.09, 0.16, 1), metallic: 0.25, roughness: 0.55),
        StarterMaterial(name: "Spider Eye", color: SIMD4(0.95, 0.82, 0.25, 1), metallic: 0.20, roughness: 0.30),
      ],
      parts: spider(body: 0, dark: 1, eye: 2)
    ),
    StarterCharacter(
      id: "crab", displayName: "Crab", description: "A snappy little crab.",
      aliases: ["shellfish", "claw", "beach"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Crab Orange", color: SIMD4(0.88, 0.36, 0.16, 1), metallic: 0.35, roughness: 0.45),
        StarterMaterial(name: "Crab Dark", color: SIMD4(0.52, 0.18, 0.08, 1), metallic: 0.30, roughness: 0.50),
        FACE_DARK,
      ],
      parts: crab(shell: 0, dark: 1, eye: 2)
    ),
    StarterCharacter(
      id: "butterfly", displayName: "Butterfly", description: "A bright butterfly.",
      aliases: ["moth", "wings", "insect"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Wing Orange", color: SIMD4(0.95, 0.55, 0.15, 1), metallic: 0.25, roughness: 0.40),
        StarterMaterial(name: "Butterfly Body", color: SIMD4(0.18, 0.14, 0.18, 1), metallic: 0.30, roughness: 0.50),
        StarterMaterial(name: "Wing Pink", color: SIMD4(0.92, 0.40, 0.62, 1), metallic: 0.25, roughness: 0.40),
      ],
      parts: butterfly(wing: 0, body: 1, accent: 2)
    ),
    StarterCharacter(
      id: "bee", displayName: "Bee", description: "A stripy buzzing bee.",
      aliases: ["bumblebee", "wasp", "honey", "insect"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Bee Yellow", color: SIMD4(0.96, 0.78, 0.16, 1), metallic: 0.25, roughness: 0.45),
        StarterMaterial(name: "Bee Black", color: SIMD4(0.12, 0.11, 0.12, 1), metallic: 0.25, roughness: 0.50),
        StarterMaterial(name: "Bee Wing", color: SIMD4(0.85, 0.90, 0.95, 1), metallic: 0.20, roughness: 0.25),
      ],
      parts: bee(body: 0, dark: 1, wing: 2)
    ),
    StarterCharacter(
      id: "snake", displayName: "Snake", description: "A slithering snake.",
      aliases: ["serpent", "python", "cobra"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Snake Green", color: SIMD4(0.28, 0.62, 0.26, 1), metallic: 0.35, roughness: 0.40),
        StarterMaterial(name: "Snake Belly", color: SIMD4(0.72, 0.82, 0.42, 1), metallic: 0.30, roughness: 0.45),
        FACE_DARK,
      ],
      parts: snake(body: 0, belly: 1, eye: 2)
    ),
    StarterCharacter(
      id: "frog", displayName: "Frog", description: "A hopping frog.",
      aliases: ["toad", "amphibian", "pond"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Frog Green", color: SIMD4(0.34, 0.70, 0.28, 1), metallic: 0.30, roughness: 0.45),
        StarterMaterial(name: "Frog Belly", color: SIMD4(0.85, 0.90, 0.60, 1), metallic: 0.25, roughness: 0.50),
        FACE_DARK,
      ],
      parts: frog(body: 0, belly: 1, eye: 2)
    ),
    StarterCharacter(
      id: "turtle", displayName: "Turtle", description: "A slow friendly turtle.",
      aliases: ["tortoise", "shell", "sea turtle"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Shell Brown", color: SIMD4(0.42, 0.30, 0.16, 1), metallic: 0.35, roughness: 0.50),
        StarterMaterial(name: "Turtle Green", color: SIMD4(0.36, 0.62, 0.34, 1), metallic: 0.30, roughness: 0.50),
        FACE_DARK,
      ],
      parts: turtle(shell: 0, skin: 1, eye: 2)
    ),
    StarterCharacter(
      id: "jellyfish", displayName: "Jellyfish", description: "A drifting jellyfish.",
      aliases: ["jelly", "sea creature", "ocean"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Jelly Pink", color: SIMD4(0.94, 0.55, 0.78, 1), metallic: 0.20, roughness: 0.30),
        StarterMaterial(name: "Tentacle", color: SIMD4(0.80, 0.38, 0.66, 1), metallic: 0.20, roughness: 0.35),
        FACE_DARK,
      ],
      parts: jellyfish(bell: 0, tentacle: 1, eye: 2)
    ),
    StarterCharacter(
      id: "snail", displayName: "Snail", description: "A slow snail with a spiral shell.",
      aliases: ["slug", "shell", "garden"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Shell Amber", color: SIMD4(0.78, 0.52, 0.20, 1), metallic: 0.40, roughness: 0.40),
        StarterMaterial(name: "Snail Body", color: SIMD4(0.80, 0.72, 0.58, 1), metallic: 0.20, roughness: 0.55),
        FACE_DARK,
      ],
      parts: snail(shell: 0, bodyMat: 1, eye: 2)
    ),
    StarterCharacter(
      id: "house", displayName: "House", description: "A little cottage.",
      aliases: ["home", "cottage", "building"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Wall Cream", color: SIMD4(0.92, 0.87, 0.75, 1), metallic: 0.15, roughness: 0.65),
        StarterMaterial(name: "Roof Red", color: SIMD4(0.72, 0.26, 0.20, 1), metallic: 0.25, roughness: 0.55),
        StarterMaterial(name: "Door Brown", color: SIMD4(0.42, 0.28, 0.16, 1), metallic: 0.20, roughness: 0.60),
      ],
      parts: house(walls: 0, roof: 1, trim: 2)
    ),
    StarterCharacter(
      id: "castle", displayName: "Castle", description: "A stone tower with battlements.",
      aliases: ["tower", "fortress", "keep"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Stone Grey", color: SIMD4(0.62, 0.62, 0.60, 1), metallic: 0.25, roughness: 0.70),
        StarterMaterial(name: "Roof Blue", color: SIMD4(0.24, 0.34, 0.62, 1), metallic: 0.35, roughness: 0.45),
        StarterMaterial(name: "Gate Wood", color: SIMD4(0.36, 0.24, 0.14, 1), metallic: 0.20, roughness: 0.65),
      ],
      parts: castle(stone: 0, roof: 1, trim: 2)
    ),
    StarterCharacter(
      id: "mushroom", displayName: "Mushroom", description: "A spotted toadstool.",
      aliases: ["toadstool", "fungus", "forest"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Cap Red", color: SIMD4(0.82, 0.20, 0.20, 1), metallic: 0.25, roughness: 0.45),
        StarterMaterial(name: "Stem Cream", color: SIMD4(0.94, 0.90, 0.82, 1), metallic: 0.15, roughness: 0.55),
        StarterMaterial(name: "Spot White", color: SIMD4(0.98, 0.97, 0.94, 1), metallic: 0.15, roughness: 0.45),
      ],
      parts: mushroom(cap: 0, stem: 1, spot: 2)
    ),
    StarterCharacter(
      id: "flower", displayName: "Flower", description: "A cheerful flower.",
      aliases: ["daisy", "bloom", "plant", "garden"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Petal Pink", color: SIMD4(0.95, 0.48, 0.68, 1), metallic: 0.20, roughness: 0.45),
        StarterMaterial(name: "Centre Yellow", color: SIMD4(0.97, 0.80, 0.20, 1), metallic: 0.25, roughness: 0.45),
        StarterMaterial(name: "Stem Green", color: SIMD4(0.28, 0.58, 0.26, 1), metallic: 0.20, roughness: 0.55),
      ],
      parts: flower(petal: 0, centre: 1, stem: 2)
    ),
    StarterCharacter(
      id: "star", displayName: "Star", description: "A twinkling star.",
      aliases: ["sparkle", "shine", "space", "collectible"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Star Gold", color: SIMD4(0.98, 0.80, 0.22, 1), metallic: 0.75, roughness: 0.25),
        StarterMaterial(name: "Star Glow", color: SIMD4(1.0, 0.90, 0.45, 1), metallic: 0.65, roughness: 0.20),
        FACE_DARK,
      ],
      parts: star(bodyMat: 0, glow: 1, eye: 2)
    ),
    StarterCharacter(
      id: "chest", displayName: "Treasure Chest", description: "A chest full of treasure.",
      aliases: ["treasure", "loot", "box", "pirate chest"], defaultSize: 1.0,
      materials: [
        StarterMaterial(name: "Chest Wood", color: SIMD4(0.48, 0.30, 0.16, 1), metallic: 0.25, roughness: 0.60),
        StarterMaterial(name: "Chest Iron", color: SIMD4(0.38, 0.38, 0.42, 1), metallic: 0.70, roughness: 0.35),
        StarterMaterial(name: "Chest Gold", color: SIMD4(0.95, 0.78, 0.25, 1), metallic: 0.85, roughness: 0.20),
      ],
      parts: chest(wood: 0, metal: 1, gold: 2)
    ),
  ]
}
