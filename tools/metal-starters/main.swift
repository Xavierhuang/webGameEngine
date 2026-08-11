import Foundation

private enum Selection {
  case character(String)
  case all
}

private struct Options {
  let selection: Selection
  let libraryURL: URL
  let outputDirectoryURL: URL
  let metadataURL: URL?
}

private func cliError(_ message: String) -> NSError {
  NSError(
    domain: "MetalStartersCLI",
    code: 1,
    userInfo: [NSLocalizedDescriptionKey: message]
  )
}

private func parseArguments() throws -> Options {
  let arguments = Array(CommandLine.arguments.dropFirst())
  var characterID: String?
  var generateAll = false
  var libraryPath: String?
  var outputDirectory: String?
  var metadataPath: String?
  var index = 0

  while index < arguments.count {
    switch arguments[index] {
    case "--character":
      guard index + 1 < arguments.count else {
        throw cliError("--character requires an identifier")
      }
      characterID = arguments[index + 1]
      index += 2
    case "--all":
      generateAll = true
      index += 1
    case "--library":
      guard index + 1 < arguments.count else {
        throw cliError("--library requires a path")
      }
      libraryPath = arguments[index + 1]
      index += 2
    case "--output-dir":
      guard index + 1 < arguments.count else {
        throw cliError("--output-dir requires a path")
      }
      outputDirectory = arguments[index + 1]
      index += 2
    case "--metadata":
      guard index + 1 < arguments.count else {
        throw cliError("--metadata requires a path")
      }
      metadataPath = arguments[index + 1]
      index += 2
    default:
      throw cliError("Unknown argument: \(arguments[index])")
    }
  }

  guard generateAll != (characterID != nil) else {
    throw cliError("Choose exactly one of --character <id> or --all")
  }
  guard let libraryPath, let outputDirectory else {
    throw cliError("--library and --output-dir are required")
  }
  if generateAll && metadataPath == nil {
    throw cliError("--all requires --metadata <file>")
  }
  if !generateAll && metadataPath != nil {
    throw cliError("--metadata is only valid with --all")
  }

  return Options(
    selection: generateAll ? .all : .character(characterID!),
    libraryURL: URL(fileURLWithPath: libraryPath),
    outputDirectoryURL: URL(fileURLWithPath: outputDirectory),
    metadataURL: metadataPath.map(URL.init(fileURLWithPath:))
  )
}

private func generate(
  character: StarterCharacter,
  libraryURL: URL,
  outputDirectoryURL: URL
) throws -> GeneratedBounds {
  let vertices = try generateVertices(character: character, libraryURL: libraryURL)
  return try writeGLB(
    character: character,
    vertices: vertices,
    outputURL: outputDirectoryURL.appendingPathComponent("\(character.id).glb")
  )
}

do {
  let options = try parseArguments()
  let catalog = starterCatalog()

  switch options.selection {
  case .character(let id):
    guard let character = catalog.first(where: { $0.id == id }) else {
      throw cliError("Unknown starter character: \(id)")
    }
    _ = try generate(
      character: character,
      libraryURL: options.libraryURL,
      outputDirectoryURL: options.outputDirectoryURL
    )
  case .all:
    var results: [(StarterCharacter, GeneratedBounds)] = []
    results.reserveCapacity(catalog.count)
    for character in catalog {
      let bounds = try generate(
        character: character,
        libraryURL: options.libraryURL,
        outputDirectoryURL: options.outputDirectoryURL
      )
      results.append((character, bounds))
    }
    try writeMetadata(results: results, outputURL: options.metadataURL!)
  }
} catch {
  fputs("Metal starter generation failed: \(error.localizedDescription)\n", stderr)
  exit(1)
}
