// nimi-extract — macOS-native OCR (Vision) + ASR (Speech) CLI helper.
//
// Usage:
//   nimi-extract ocr <image-path>   → print recognized text to stdout
//   nimi-extract asr <audio-path>   → print transcript to stdout
//
// Build (macOS 13+, output next to this file):
//   swiftc nimi-extract.swift -O -target arm64-apple-macosx13.0 -o nimi-extract
//   # Or universal binary:
//   swiftc nimi-extract.swift -O -target arm64-apple-macosx13.0 -o nimi-extract-arm64
//   swiftc nimi-extract.swift -O -target x86_64-apple-macosx13.0 -o nimi-extract-x86
//   lipo -create -output nimi-extract nimi-extract-arm64 nimi-extract-x86
//
// Exits 0 on success (text on stdout), nonzero on error (message on stderr).

import Foundation
import Vision
import Speech

// ── Entry ─────────────────────────────────────────────────────────────────

let args = CommandLine.arguments
guard args.count == 3 else {
    fputs("usage: nimi-extract ocr|asr <path>\n", stderr)
    exit(1)
}
let command = args[1]
let path    = args[2]

switch command {
case "ocr": runOcr(path: path)
case "asr": runAsr(path: path)
default:
    fputs("unknown command: \(command)\n", stderr)
    exit(1)
}

// ── OCR via Vision ────────────────────────────────────────────────────────

func runOcr(path: String) {
    let url = URL(fileURLWithPath: path)
    guard let cgImage = loadImage(url: url) else {
        fputs("ocr: could not load image at \(path)\n", stderr)
        exit(2)
    }

    let sema = DispatchSemaphore(value: 0)
    var recognized = ""

    let request = VNRecognizeTextRequest { req, err in
        defer { sema.signal() }
        if let err {
            fputs("ocr: vision error: \(err.localizedDescription)\n", stderr)
            return
        }
        let observations = req.results as? [VNRecognizedTextObservation] ?? []
        recognized = observations
            .compactMap { $0.topCandidates(1).first?.string }
            .joined(separator: "\n")
    }
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
        try handler.perform([request])
    } catch {
        fputs("ocr: handler error: \(error.localizedDescription)\n", stderr)
        exit(2)
    }
    sema.wait()

    print(recognized)
}

// ── ASR via Speech ────────────────────────────────────────────────────────

func runAsr(path: String) {
    let url = URL(fileURLWithPath: path)
    let sema = DispatchSemaphore(value: 0)

    // Request authorization — in a bundled helper running as a child of the
    // main Electron process, TCC authorization flows through the parent app.
    SFSpeechRecognizer.requestAuthorization { status in
        guard status == .authorized else {
            fputs("asr: speech recognition not authorized (status=\(status.rawValue))\n", stderr)
            exit(3)
        }
        sema.signal()
    }
    sema.wait()

    guard let recognizer = SFSpeechRecognizer(locale: Locale.current),
          recognizer.isAvailable else {
        fputs("asr: speech recognizer unavailable for locale \(Locale.current.identifier)\n", stderr)
        exit(3)
    }

    let request = SFSpeechURLRecognitionRequest(url: url)
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults   = false

    let doneSema = DispatchSemaphore(value: 0)
    var transcript = ""

    recognizer.recognitionTask(with: request) { result, error in
        if let error {
            fputs("asr: recognition error: \(error.localizedDescription)\n", stderr)
            doneSema.signal()
            return
        }
        if let result, result.isFinal {
            transcript = result.bestTranscription.formattedString
            doneSema.signal()
        }
    }

    doneSema.wait()
    print(transcript)
}

// ── Image loading (supports HEIC, PNG, JPEG, …) ───────────────────────────

#if canImport(CoreGraphics)
import CoreGraphics
#endif
#if canImport(ImageIO)
import ImageIO
#endif

func loadImage(url: URL) -> CGImage? {
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
        return nil
    }
    return img
}
