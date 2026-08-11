import Foundation
import simd

struct StarterMaterial {
  let name: String
  let color: SIMD4<Float>
  let metallic: Float
  let roughness: Float
}

struct StarterPart {
  let name: String
  let center: SIMD3<Float>
  let radius: SIMD3<Float>
  let rotation: SIMD3<Float>
  let rings: UInt32
  let segments: UInt32
  let material: Int
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

func starterCatalog() -> [StarterCharacter] {
  [
    StarterCharacter(
      id: "dinosaur", displayName: "Dinosaur", description: "A friendly toy dinosaur.",
      aliases: ["dino"], defaultSize: 1.0,
      materials: material("Dinosaur Green", SIMD4(0.12, 0.55, 0.22, 1)),
      parts: body(radius: SIMD3(0.85, 0.7, 0.55))
    ),
    StarterCharacter(
      id: "unicorn", displayName: "Unicorn", description: "A bright magical toy unicorn.",
      aliases: ["pony"], defaultSize: 1.0,
      materials: material("Unicorn Pearl", SIMD4(0.9, 0.72, 0.88, 1)),
      parts: body()
    ),
    StarterCharacter(
      id: "robot", displayName: "Robot", description: "A cheerful helper robot.",
      aliases: ["bot"], defaultSize: 1.0,
      materials: material("Robot Silver", SIMD4(0.48, 0.58, 0.68, 1)),
      parts: body(radius: SIMD3(0.62, 0.82, 0.5))
    ),
    StarterCharacter(
      id: "knight", displayName: "Knight", description: "A brave armored toy knight.",
      aliases: ["warrior"], defaultSize: 1.0,
      materials: material("Knight Steel", SIMD4(0.42, 0.48, 0.58, 1)),
      parts: body()
    ),
    StarterCharacter(
      id: "wizard", displayName: "Wizard", description: "A wise toy wizard.",
      aliases: ["mage"], defaultSize: 1.0,
      materials: material("Wizard Violet", SIMD4(0.38, 0.16, 0.66, 1)),
      parts: body()
    ),
    StarterCharacter(
      id: "princess", displayName: "Princess", description: "A royal toy adventurer.",
      aliases: ["royal"], defaultSize: 1.0,
      materials: material("Princess Rose", SIMD4(0.86, 0.3, 0.58, 1)),
      parts: body()
    ),
    StarterCharacter(
      id: "astronaut", displayName: "Astronaut", description: "A space-exploring toy astronaut.",
      aliases: ["space explorer"], defaultSize: 1.0,
      materials: material("Astronaut White", SIMD4(0.82, 0.86, 0.9, 1)),
      parts: body()
    ),
    StarterCharacter(
      id: "ninja", displayName: "Ninja", description: "A quick and quiet toy ninja.",
      aliases: ["shinobi"], defaultSize: 1.0,
      materials: material("Ninja Charcoal", SIMD4(0.06, 0.07, 0.09, 1)),
      parts: body()
    ),
    StarterCharacter(
      id: "puppy", displayName: "Puppy", description: "A playful toy puppy.",
      aliases: ["dog"], defaultSize: 1.0,
      materials: material("Puppy Gold", SIMD4(0.68, 0.4, 0.16, 1)),
      parts: body(radius: SIMD3(0.72, 0.62, 0.52))
    ),
    StarterCharacter(
      id: "superhero", displayName: "Superhero", description: "A soaring toy superhero.",
      aliases: ["hero"], defaultSize: 1.0,
      materials: material("Hero Blue", SIMD4(0.05, 0.24, 0.72, 1)),
      parts: body()
    ),
  ]
}
