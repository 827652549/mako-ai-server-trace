// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Telemetry",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [
        .library(name: "Telemetry", targets: ["Telemetry"]),
    ],
    targets: [
        .target(name: "Telemetry"),
    ]
)
