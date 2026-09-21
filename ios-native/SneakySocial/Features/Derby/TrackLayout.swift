import CoreGraphics
import Foundation

/// The track's fixed geometry, in points. Straight from DuckyDerbyPage.jsx —
/// the numbers are tuned so the top duck pokes over the far bank and the last
/// one tucks behind the near one.
struct TrackLayout {
    static let duckWidth: CGFloat = 70
    static let duckHeight: CGFloat = 60
    static let laneGap: CGFloat = 15
    static let grassTop: CGFloat = 58
    static let mudHeight: CGFloat = 12
    static let waterTop: CGFloat = grassTop + mudHeight
    static let topOverlap: CGFloat = 16
    static let grassBottom: CGFloat = 22
    static let bottomTuck: CGFloat = 12
    static let grassTileWidth: CGFloat = 96
    static let waveTileWidth: CGFloat = 180

    /// Where the bread lure's wire ends, just past the finish.
    static let breadEndX: Double = RaceEngine.courseLength + 0.08

    let duckCount: Int

    var height: CGFloat {
        let lastDuckBottom = Self.waterTop - Self.topOverlap
            + CGFloat(max(0, duckCount - 1)) * Self.laneGap + Self.duckHeight
        return lastDuckBottom - Self.bottomTuck + Self.grassBottom
    }

    func laneTop(_ lane: Int) -> CGFloat {
        Self.waterTop - Self.topOverlap + CGFloat(lane) * Self.laneGap
    }

    /// World X (course units) → screen X (points).
    func screenX(world: Double, cameraX: Double, width: CGFloat) -> CGFloat {
        CGFloat(world - cameraX) * width
    }
}

/// A banner planted on one of the banks. Spread evenly around mid-course with a
/// fixed gap, so they stay readable as the camera scrolls rather than strung out.
struct BannerPlacement: Identifiable {
    let ord: Int
    let text: String
    let isBottom: Bool
    let worldX: Double

    var id: Int { ord }

    static let maximumGap: Double = 0.38

    static func layout(_ banners: [DuckyTextRow]) -> [BannerPlacement] {
        let usable = banners.filter(\.isUsable)
        return spread(usable.filter { !$0.isBottomBanner }, isBottom: false)
            + spread(usable.filter(\.isBottomBanner), isBottom: true)
    }

    private static func spread(_ group: [DuckyTextRow], isBottom: Bool) -> [BannerPlacement] {
        guard !group.isEmpty else { return [] }
        let middle = RaceEngine.courseLength * 0.5
        let span = Double(group.count - 1) * maximumGap
        let start = max(0.28, middle - span / 2)

        return group.enumerated().map { index, banner in
            BannerPlacement(
                ord: banner.ord,
                text: banner.text,
                isBottom: isBottom,
                worldX: group.count <= 1 ? middle : start + maximumGap * Double(index)
            )
        }
    }
}

/// Buoys, lily pads and icebergs laid out along the course in their duck's lane.
struct CourseFurniture {
    struct Buoy: Identifiable {
        let id: String
        let worldX: Double
        let y: CGFloat
        let colour: String
        let bobDuration: Double
        let bobOffset: Double
    }

    struct Pad: Identifiable {
        let id: String
        let worldX: Double
        let y: CGFloat
    }

    struct Iceberg: Identifiable {
        let id: String
        let worldX: Double
        let y: CGFloat
        let width: CGFloat
        var height: CGFloat { width * Sprites.icebergAspect }
    }

    var buoys: [Buoy] = []
    var pads: [Pad] = []
    var icebergs: [Iceberg] = []

    init() {}

    /// `night` gates the icebergs: they only belong in the dark scene.
    init(result: DuckyRaceResult, config: DuckyConfig?, layout: TrackLayout, night: Bool) {
        var generator = SystemRandomNumberGenerator()

        for (lane, duck) in result.ducks.enumerated() {
            let laneY = layout.laneTop(lane)

            for (index, obstacle) in result.obstacles(for: duck.ord).enumerated() {
                let worldX = obstacle.at * RaceEngine.courseLength
                let key = "\(duck.ord)-\(index)"

                switch obstacle.kind {
                case .buoy:
                    buoys.append(Buoy(
                        id: "b\(key)",
                        worldX: worldX,
                        y: laneY + 24,
                        colour: obstacle.colour ?? config?.buoyColour ?? "#e0322e",
                        bobDuration: 6 + Double.random(in: 0..<3, using: &generator),
                        bobOffset: (obstacle.fromTop ? 0 : -3) - Double.random(in: 0..<2.5, using: &generator)
                    ))
                case .pad:
                    pads.append(Pad(id: "p\(key)", worldX: worldX, y: laneY + 30))
                case .iceberg:
                    guard night else { continue }
                    let minimum = Double(max(1, min(10, config?.icebergSizeMin ?? 2)))
                    let maximum = max(minimum, Double(max(1, min(10, config?.icebergSize ?? 7))))
                    let size = Double.random(in: minimum...maximum, using: &generator)
                    icebergs.append(Iceberg(
                        id: "i\(key)",
                        worldX: worldX,
                        y: laneY + 18,
                        width: CGFloat((70 + (size - 1) * 7.8).rounded())
                    ))
                case .whirl:
                    break // the whirlpool is the duck's own drift, nothing to draw
                }
            }
        }
    }
}

/// One piece of confetti. Generated once per race so it doesn't reshuffle every frame.
struct ConfettiPiece: Identifiable {
    let id: Int
    let x: Double          // 0…1 across the track
    let colourIndex: Int
    let delay: Double      // seconds
    let duration: Double   // seconds
    let size: CGFloat
    let drift: CGFloat

    static func field(count: Int = 60) -> [ConfettiPiece] {
        (0..<count).map { index in
            ConfettiPiece(
                id: index,
                x: Double.random(in: 0...1),
                colourIndex: index % 7,
                delay: Double.random(in: 0..<1.2),
                duration: 1.9 + Double.random(in: 0..<1.8),
                size: CGFloat(6 + Double.random(in: 0..<6)),
                drift: CGFloat(Double.random(in: -45...45))
            )
        }
    }
}
