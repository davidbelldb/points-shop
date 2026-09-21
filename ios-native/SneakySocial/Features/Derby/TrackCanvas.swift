import SwiftUI

/// The race track: one `Canvas` redrawn every frame inside a `TimelineView`,
/// with the camera tracking the leader. Everything on screen is a function of
/// elapsed time, so there is no animation state to keep in sync.
struct TrackCanvas: View {
    let viewModel: DerbyViewModel
    let furniture: CourseFurniture
    let banners: [BannerPlacement]
    let isNight: Bool
    var reduceMotion = false

    @State private var confetti = ConfettiPiece.field()

    private var layout: TrackLayout {
        TrackLayout(duckCount: max(1, viewModel.ducks.count))
    }

    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas(opaque: true) { context, size in
                draw(into: &context, size: size, at: timeline.date)
            }
        }
        .frame(height: layout.height)
        .clipShape(.rect(cornerRadius: 16))
        .shadow(color: .black.opacity(0.18), radius: 8, y: 4)
    }

    // MARK: - Colours

    private var water: Color {
        isNight ? Palette.nightWater : Color(hex: viewModel.config?.waterColour ?? "#4aa3c7")
    }
    private var grass: Color {
        isNight ? Palette.nightGrass : Color(hex: viewModel.config?.grassColour ?? "#5bbf3a")
    }
    private var mud: Color {
        isNight ? Palette.nightMud : Color(hex: viewModel.config?.mudColour ?? "#6b4a2a")
    }
    private var grassHex: String {
        isNight ? "#1a3d20" : (viewModel.config?.grassColour ?? "#5bbf3a")
    }
    private var waterHex: String {
        isNight ? "#0b2545" : (viewModel.config?.waterColour ?? "#4aa3c7")
    }

    // MARK: - Frame

    private func draw(into context: inout GraphicsContext, size: CGSize, at date: Date) {
        let seconds = date.timeIntervalSinceReferenceDate
        let elapsedMs: Double
        switch viewModel.phase {
        case .racing:
            elapsedMs = max(0, date.timeIntervalSince(viewModel.phaseStartedAt) * 1000)
        case .result:
            // Freeze on the last frame of the race rather than resetting.
            elapsedMs = viewModel.photo?.realEndMs ?? 0
        default:
            elapsedMs = 0
        }

        let runners = viewModel.isRacing || viewModel.phase == .result
            ? viewModel.runners(atRealElapsed: elapsedMs)
            : startingGrid()

        let leader = viewModel.leaderProgress(among: runners)
        let cameraX = viewModel.isPreRace ? 0 : RaceEngine.cameraX(leaderProgress: leader)

        drawWater(&context, size: size, seconds: seconds)
        drawFarBank(&context, size: size, cameraX: cameraX)
        drawLines(&context, size: size, cameraX: cameraX)
        drawPads(&context, size: size, cameraX: cameraX)
        drawIcebergs(&context, size: size, cameraX: cameraX)
        drawBuoys(&context, size: size, cameraX: cameraX, seconds: seconds)
        drawBanners(&context, size: size, cameraX: cameraX, bottom: false)
        drawRunners(&context, size: size, runners: runners, leader: leader,
                    cameraX: cameraX, elapsedMs: elapsedMs, seconds: seconds)
        drawBubbles(&context, size: size, runners: runners, leader: leader,
                    cameraX: cameraX, elapsedMs: elapsedMs)
        drawNearBank(&context, size: size, cameraX: cameraX)

        if viewModel.showsConfetti(atRealElapsed: elapsedMs) {
            drawConfetti(&context, size: size, seconds: seconds)
        }

        drawBanners(&context, size: size, cameraX: cameraX, bottom: true)
        drawBread(&context, size: size, cameraX: cameraX, elapsedMs: elapsedMs)

        let flash = viewModel.photoFlashOpacity(atRealElapsed: elapsedMs)
        if flash > 0 {
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.white.opacity(flash)))
        }
    }

    /// Before the off, everyone sits on the start line bobbing.
    private func startingGrid() -> [DerbyViewModel.Runner] {
        viewModel.ducks.enumerated().map { lane, duck in
            DerbyViewModel.Runner(
                duck: duck, lane: lane,
                state: RaceEngine.DuckState(progress: 0, pause: nil),
                isSinking: false, sinkProgress: 0
            )
        }
    }

    // MARK: - Water & waves

    private func drawWater(_ context: inout GraphicsContext, size: CGSize, seconds: Double) {
        context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(water))

        let bands: [(y: CGFloat, shade: Int, opacity: Double, period: Double)] = [
            (TrackLayout.waterTop + 20, 26, isNight ? 0.75 : 0.55, 7),
            (TrackLayout.waterTop + 80, -22, isNight ? 0.55 : 0.40, 11),
            (TrackLayout.waterTop + 140, 40, isNight ? 0.70 : 0.50, 9),
        ]

        for band in bands where band.y < size.height {
            let phase = -(seconds.truncatingRemainder(dividingBy: band.period) / band.period)
                * TrackLayout.waveTileWidth
            context.fill(
                wavePath(width: size.width, y: band.y, offset: phase),
                with: .color(Color.shade(waterHex, by: band.shade).opacity(band.opacity))
            )
        }
    }

    /// The repeating `M0 18 Q45 5 90 18 T180 18 V30 H0 Z` tile from the web app.
    private func wavePath(width: CGFloat, y: CGFloat, offset: Double) -> Path {
        var path = Path()
        let tile = TrackLayout.waveTileWidth
        var x = CGFloat(offset)

        while x < width {
            path.move(to: CGPoint(x: x, y: y + 18))
            path.addQuadCurve(to: CGPoint(x: x + tile / 2, y: y + 18),
                              control: CGPoint(x: x + tile / 4, y: y + 5))
            path.addQuadCurve(to: CGPoint(x: x + tile, y: y + 18),
                              control: CGPoint(x: x + tile * 0.75, y: y + 31))
            path.addLine(to: CGPoint(x: x + tile, y: y + 30))
            path.addLine(to: CGPoint(x: x, y: y + 30))
            path.closeSubpath()
            x += tile
        }
        return path
    }

    // MARK: - Banks

    private func drawFarBank(_ context: inout GraphicsContext, size: CGSize, cameraX: Double) {
        context.fill(
            Path(CGRect(x: 0, y: 0, width: size.width, height: TrackLayout.grassTop)),
            with: .color(grass)
        )
        context.fill(
            grassFringe(width: size.width, top: TrackLayout.grassTop - 22, cameraX: cameraX, canvasWidth: size.width),
            with: .color(Color.shade(grassHex, by: -34))
        )
        context.fill(
            Path(CGRect(x: 0, y: TrackLayout.grassTop, width: size.width, height: TrackLayout.mudHeight)),
            with: .color(mud)
        )
    }

    private func drawNearBank(_ context: inout GraphicsContext, size: CGSize, cameraX: Double) {
        context.fill(
            Path(CGRect(x: 0, y: size.height - TrackLayout.grassBottom,
                        width: size.width, height: TrackLayout.grassBottom)),
            with: .color(grass)
        )
        context.fill(
            grassFringe(width: size.width,
                        top: size.height - TrackLayout.grassBottom - 12,
                        cameraX: cameraX, canvasWidth: size.width),
            with: .color(Color.shade(grassHex, by: -28))
        )
    }

    /// Spiky blades, scrolled with the camera so they drift past at world speed.
    private func grassFringe(width: CGFloat, top: CGFloat, cameraX: Double, canvasWidth: CGFloat) -> Path {
        let tile = TrackLayout.grassTileWidth
        let offset = CGFloat((-(cameraX * Double(canvasWidth))).truncatingRemainder(dividingBy: Double(tile)))
        let tips: [CGFloat] = [12, 3, 12, 1, 12, 4, 12, 2, 12, 3, 12, 1, 12]

        var path = Path()
        var x = offset - tile
        while x < width {
            path.move(to: CGPoint(x: x, y: top + 22))
            path.addLine(to: CGPoint(x: x + tile, y: top + 22))
            for (index, tip) in tips.enumerated().reversed() {
                path.addLine(to: CGPoint(x: x + tile * CGFloat(index) / CGFloat(tips.count - 1), y: top + tip))
            }
            path.closeSubpath()
            x += tile
        }
        return path
    }

    // MARK: - Course markings

    private func drawLines(_ context: inout GraphicsContext, size: CGSize, cameraX: Double) {
        let top = TrackLayout.waterTop - 8
        let height = size.height - top

        // Finish — a 16pt checkerboard column.
        let finishX = layout.screenX(world: RaceEngine.courseLength, cameraX: cameraX, width: size.width)
        if finishX > -20, finishX < size.width + 20 {
            var y = top
            var row = 0
            while y < size.height {
                for column in 0..<2 {
                    let dark = (row + column).isMultiple(of: 2)
                    context.fill(
                        Path(CGRect(x: finishX + CGFloat(column) * 8, y: y, width: 8, height: 8)),
                        with: .color(dark ? (isNight ? Color(hex: "#07050f") : .black)
                                          : (isNight ? Color(hex: "#c8d8f0") : .white))
                    )
                }
                y += 8
                row += 1
            }
        }

        // Start — a dashed marking painted on the water.
        let startX = layout.screenX(world: RaceEngine.startX, cameraX: cameraX, width: size.width)
        if startX > -20, startX < size.width + 20 {
            var path = Path()
            path.move(to: CGPoint(x: startX, y: top))
            path.addLine(to: CGPoint(x: startX, y: top + height))
            context.stroke(path, with: .color(.white.opacity(0.95)),
                           style: StrokeStyle(lineWidth: 3, dash: [8, 6]))
        }
    }

    // MARK: - Furniture

    private func drawPads(_ context: inout GraphicsContext, size: CGSize, cameraX: Double) {
        for pad in furniture.pads {
            let x = layout.screenX(world: pad.worldX, cameraX: cameraX, width: size.width)
            guard x > -60, x < size.width + 60 else { continue }

            context.fill(
                Path(ellipseIn: CGRect(x: x, y: pad.y, width: 38, height: 20)),
                with: .color(isNight ? Color(hex: "#0a3d14") : Color(hex: "#3a9d4a"))
            )
            context.fill(
                Path(ellipseIn: CGRect(x: x + 38 * 0.22, y: pad.y + 20 * 0.22, width: 9, height: 9)),
                with: .color(isNight ? Color(hex: "#e8207a") : Color(hex: "#ff8fc3"))
            )
            context.fill(
                Path(ellipseIn: CGRect(x: x + 38 * 0.27, y: pad.y + 20 * 0.32, width: 3, height: 3)),
                with: .color(Color(hex: "#ffe27a"))
            )
        }
    }

    private func drawIcebergs(_ context: inout GraphicsContext, size: CGSize, cameraX: Double) {
        guard let image = Sprites.iceberg else { return }
        let resolved = context.resolve(image)

        for iceberg in furniture.icebergs {
            let x = layout.screenX(world: iceberg.worldX, cameraX: cameraX, width: size.width)
            guard x > -iceberg.width - 20, x < size.width + 20 else { continue }
            context.draw(resolved, in: CGRect(x: x, y: iceberg.y,
                                              width: iceberg.width, height: iceberg.height))
        }
    }

    private func drawBuoys(_ context: inout GraphicsContext, size: CGSize, cameraX: Double, seconds: Double) {
        for buoy in furniture.buoys {
            let x = layout.screenX(world: buoy.worldX, cameraX: cameraX, width: size.width)
            guard x > -60, x < size.width + 60 else { continue }

            // Bobs up and down the river on its own cycle.
            let phase = (seconds + buoy.bobOffset).truncatingRemainder(dividingBy: buoy.bobDuration)
                / buoy.bobDuration
            let bob = CGFloat(sin(phase * 2 * .pi) * 9)
            let y = buoy.y + bob

            context.fill(
                Path(CGRect(x: x + 13.5, y: y - 5, width: 3, height: 7)),
                with: .color(.black.opacity(isNight ? 0.65 : 0.45))
            )
            let body = Path(roundedRect: CGRect(x: x, y: y, width: 30, height: 18),
                            cornerRadii: RectangleCornerRadii(topLeading: 12, bottomLeading: 4,
                                                              bottomTrailing: 4, topTrailing: 12))
            var colour = Color(hex: buoy.colour)
            if isNight { colour = colour.opacity(0.8) }
            context.fill(body, with: .color(colour))
            context.stroke(body, with: .color(.black.opacity(isNight ? 0.45 : 0.28)), lineWidth: 2)
        }
    }

    // MARK: - Banners

    private func drawBanners(_ context: inout GraphicsContext, size: CGSize, cameraX: Double, bottom: Bool) {
        let poleColour = isNight ? Color(hex: "#07050f") : Color(hex: "#1a1a1a")
        let clothColour = isNight ? Color(hex: "#1e1848") : Color.white
        let textColour = isNight ? Color(hex: "#dcd8ff") : Color.black

        for banner in banners where banner.isBottom == bottom {
            let centreX = layout.screenX(world: banner.worldX, cameraX: cameraX, width: size.width)
            guard centreX > -160, centreX < size.width + 160 else { continue }

            let resolved = context.resolve(
                Text(banner.text.uppercased())
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundStyle(textColour)
            )
            let maxTextWidth = min(210, size.width - 40)
            let textSize = resolved.measure(in: CGSize(width: maxTextWidth, height: 44))
            let clothWidth = textSize.width + 28
            let top = bottom ? size.height - TrackLayout.grassBottom - 41 : 6

            for side in [centreX + 4, centreX + clothWidth - 9] {
                context.fill(
                    Path(roundedRect: CGRect(x: side, y: top + 5, width: 5, height: 44), cornerRadius: 2),
                    with: .color(poleColour)
                )
            }

            let cloth = CGRect(x: centreX, y: top, width: clothWidth, height: textSize.height + 10)
            context.fill(Path(roundedRect: cloth.insetBy(dx: -2, dy: -2), cornerRadius: 3),
                         with: .color(poleColour))
            context.fill(Path(roundedRect: cloth, cornerRadius: 2), with: .color(clothColour))
            context.draw(resolved, in: cloth.insetBy(dx: 14, dy: 5))
        }
    }

    // MARK: - Ducks

    private func drawRunners(
        _ context: inout GraphicsContext, size: CGSize,
        runners: [DerbyViewModel.Runner], leader: Double,
        cameraX: Double, elapsedMs: Double, seconds: Double
    ) {
        var resolvedDucks: [Int: GraphicsContext.ResolvedImage] = [:]
        for runner in runners {
            if let image = Sprites.duck(ord: runner.duck.ord, night: isNight) {
                resolvedDucks[runner.duck.ord] = context.resolve(image)
            }
        }

        for runner in runners {
            let position = duckOrigin(runner: runner, leader: leader, cameraX: cameraX,
                                      size: size, elapsedMs: elapsedMs)
            guard position.x > -TrackLayout.duckWidth - 40, position.x < size.width + 40 else { continue }

            context.drawLayer { layer in
                layer.opacity = runner.isSinking ? 1 - runner.sinkProgress : 1
                let centre = CGPoint(x: position.x + TrackLayout.duckWidth / 2,
                                     y: position.y + TrackLayout.duckHeight / 2)
                layer.translateBy(x: centre.x, y: centre.y)
                layer.rotate(by: .degrees(duckRotation(runner: runner, elapsedMs: elapsedMs, seconds: seconds)))
                layer.scaleBy(x: duckStretch(runner: runner), y: 1)

                let rect = CGRect(x: -TrackLayout.duckWidth / 2, y: -TrackLayout.duckHeight / 2,
                                  width: TrackLayout.duckWidth, height: TrackLayout.duckHeight)

                if let resolved = resolvedDucks[runner.duck.ord] {
                    layer.draw(resolved, in: rect)
                } else {
                    // No artwork — fall back to the admin's colours, as the web app does.
                    layer.fill(
                        Path(ellipseIn: CGRect(x: rect.minX + 6, y: rect.minY + 12,
                                               width: rect.width * 0.82, height: rect.height * 0.62)),
                        with: .color(Color(hex: runner.duck.duckColour ?? "#f5c542"))
                    )
                    layer.fill(
                        Path(ellipseIn: CGRect(x: rect.maxX - 18, y: rect.midY - 4, width: 18, height: 10)),
                        with: .color(Color(hex: runner.duck.billColour ?? "#e8912d"))
                    )
                }
            }
        }
    }

    /// Lane position plus whatever the current obstacle is doing to the duck.
    private func duckOrigin(
        runner: DerbyViewModel.Runner, leader: Double,
        cameraX: Double, size: CGSize, elapsedMs: Double
    ) -> CGPoint {
        let fraction = viewModel.isPreRace
            ? 0
            : RaceEngine.screenX(progress: runner.state.progress, leaderProgress: leader, cameraX: cameraX)

        var x = CGFloat(fraction) * size.width
        var y = layout.laneTop(runner.lane)

        switch runner.state.pause {
        case .whirl(let fraction, let loops) where !runner.isSinking:
            // A slow circular drift for the full set of loops.
            let angle = fraction * Double(loops) * 2 * .pi
            x += CGFloat(cos(angle) * 16)
            y += CGFloat(sin(angle) * 12)
        case .buoy(let fraction) where !runner.isSinking:
            x += CGFloat(sin(fraction * .pi * 9) * 3)
        default:
            break
        }

        if runner.isSinking { y += CGFloat(runner.sinkProgress * 42) }
        return CGPoint(x: x, y: y)
    }

    private func duckRotation(runner: DerbyViewModel.Runner, elapsedMs: Double, seconds: Double) -> Double {
        if runner.isSinking { return runner.sinkProgress * 28 }
        guard viewModel.isRacing else {
            if reduceMotion { return 0 }
            // Idle bob on the start line, staggered per lane.
            let phase = (seconds + Double(runner.lane) * 0.7)
                .truncatingRemainder(dividingBy: 2.4) / 2.4
            return sin(phase * 2 * .pi) * 5
        }
        return sin(elapsedMs / 320 + Double(runner.lane)) * 6
    }

    /// Mid-leap the duck stretches forward — the visible sprint off a lily pad.
    private func duckStretch(runner: DerbyViewModel.Runner) -> CGFloat {
        guard case .leap(let fraction) = runner.state.pause else { return 1 }
        return CGFloat(1 + 0.34 * sin(fraction * .pi))
    }

    private func drawBubbles(
        _ context: inout GraphicsContext, size: CGSize,
        runners: [DerbyViewModel.Runner], leader: Double,
        cameraX: Double, elapsedMs: Double
    ) {
        guard viewModel.isRacing else { return }
        let bubbles = viewModel.visibleBubbles(atRealElapsed: elapsedMs)
        guard !bubbles.isEmpty else { return }

        for runner in runners {
            guard let text = bubbles[runner.duck.ord] else { continue }
            let origin = duckOrigin(runner: runner, leader: leader, cameraX: cameraX,
                                    size: size, elapsedMs: elapsedMs)
            guard origin.x > -80, origin.x < size.width + 80 else { continue }

            let resolved = context.resolve(
                Text(text)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(isNight ? Color(hex: "#c8deff") : Color(hex: "#1f2937"))
            )
            // Measure and draw against the SAME width, or a long phrase lays out
            // wider than the pill drawn behind it.
            let maxTextWidth = min(190, size.width - 48)
            let textSize = resolved.measure(in: CGSize(width: maxTextWidth, height: 60))
            let pillWidth = textSize.width + 16
            let pillHeight = textSize.height + 8
            let idealX = origin.x + TrackLayout.duckWidth / 2 - pillWidth / 2
            let rect = CGRect(
                x: min(max(4, idealX), max(4, size.width - pillWidth - 4)),
                y: max(2, origin.y - pillHeight - 4),
                width: pillWidth,
                height: pillHeight
            )

            context.fill(Path(roundedRect: rect, cornerRadius: 8),
                         with: .color(isNight ? Color(hex: "#1e2d45") : .white))
            context.draw(resolved, in: rect.insetBy(dx: 8, dy: 4))
        }
    }

    // MARK: - Bread lure

    private func drawBread(_ context: inout GraphicsContext, size: CGSize, cameraX: Double, elapsedMs: Double) {
        let wireY = size.height - TrackLayout.grassBottom - 34
        let startX = layout.screenX(world: RaceEngine.startX, cameraX: cameraX, width: size.width)
        let endX = layout.screenX(world: TrackLayout.breadEndX, cameraX: cameraX, width: size.width)

        context.fill(
            Path(CGRect(x: startX, y: wireY, width: max(0, endX - startX), height: 2)),
            with: .color(.black)
        )

        let postTop = size.height - TrackLayout.grassBottom - 44
        let postHeight = TrackLayout.grassBottom + 40
        if let post = Sprites.breadPost(night: isNight) {
            let resolved = context.resolve(post)
            for x in [startX, endX] where x > -40 && x < size.width + 40 {
                context.draw(resolved, in: CGRect(x: x - 8, y: postTop, width: 16, height: postHeight))
            }
        }

        // The lure runs ahead of the fastest duck so it always leads the pack.
        let raceElapsed = viewModel.photo?.raceTime(fromReal: elapsedMs) ?? 0
        let progress = viewModel.isPreRace
            ? 0
            : RaceEngine.breadProgress(elapsed: raceElapsed, fastestFinishMs: viewModel.fastestFinishMs)
        let breadStart = RaceEngine.startX + 0.05
        let breadWorld = breadStart + progress * (RaceEngine.courseLength - breadStart)
        let breadX = layout.screenX(world: breadWorld, cameraX: cameraX, width: size.width)

        guard let bread = Sprites.bread(night: isNight), breadX > -40, breadX < size.width + 40 else { return }
        let resolvedBread = context.resolve(bread)
        context.drawLayer { layer in
            layer.translateBy(x: breadX, y: size.height - TrackLayout.grassBottom - 38 + 16)
            if viewModel.isRacing {
                // Swings on the wire as it goes.
                let swing = sin(elapsedMs / 1100 * 2 * .pi) * 5
                layer.rotate(by: .degrees(swing))
            }
            layer.draw(resolvedBread, in: CGRect(x: -16, y: -16, width: 32, height: 32))
        }
    }

    // MARK: - Confetti

    private func drawConfetti(_ context: inout GraphicsContext, size: CGSize, seconds: Double) {
        let colours = isNight ? Palette.nightConfetti : Palette.dayConfetti

        for piece in confetti {
            let cycle = (seconds - piece.delay).truncatingRemainder(dividingBy: piece.duration)
            guard cycle >= 0 else { continue }
            let progress = cycle / piece.duration

            context.drawLayer { layer in
                layer.translateBy(
                    x: CGFloat(piece.x) * size.width + piece.drift * CGFloat(progress),
                    y: -24 + CGFloat(progress) * (size.height + 80)
                )
                layer.rotate(by: .degrees(progress * 720))
                layer.fill(
                    Path(CGRect(x: -piece.size / 2, y: -piece.size * 0.275,
                                width: piece.size, height: piece.size * 0.55)),
                    with: .color(colours[piece.colourIndex % colours.count])
                )
            }
        }
    }
}
