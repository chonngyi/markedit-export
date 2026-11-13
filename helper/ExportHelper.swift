import AppKit
import Foundation
import CoreText

// File-based bridge for MarkEdit's sandbox. No server, shell, or network API.
let jobsRoot = ProcessInfo.processInfo.environment["MARKEDIT_EXPORT_JOBS_ROOT"].map { URL(fileURLWithPath: $0, isDirectory: true) }
    ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Containers/app.cyan.markedit/Data/Documents/markedit-export/jobs", isDirectory: true)

struct ExportRequest: Decodable {
    let version: Int
    let content: String
    let sourcePath: String?
    let options: Options
    struct Options: Decodable {
        let paper: String?
        let font: String?
        let size: String?
        let margin: String?
    }
}

enum ExportError: LocalizedError {
    case failed(String)
    var errorDescription: String? { if case .failed(let s) = self { return s }; return nil }
}

func cjkFont(_ family: String) throws -> (path: String, options: String) {
    func descriptor(_ font: CTFont) throws -> (URL, Int) {
        guard let url = CTFontDescriptorCopyAttribute(CTFontCopyFontDescriptor(font), kCTFontURLAttribute) as? URL,
              let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor] else {
            throw ExportError.failed("无法读取字体：" + family)
        }
        let name = CTFontCopyPostScriptName(font) as String
        guard let index = descriptors.firstIndex(where: { (CTFontDescriptorCopyAttribute($0, kCTFontNameAttribute) as? String) == name }) else {
            throw ExportError.failed("无法读取字体集合：" + family)
        }
        return (url, index)
    }
    let font = CTFontCreateWithName(family as CFString, 12, nil)
    guard CTFontCopyFamilyName(font) as String == family else { throw ExportError.failed("找不到字体：" + family) }
    let (url, normal) = try descriptor(font)
    var options = "Path={" + url.deletingLastPathComponent().path + "/},FontIndex=" + String(normal)
    if let bold = CTFontCreateCopyWithSymbolicTraits(font, 0, nil, .boldTrait, .boldTrait), let (boldURL, boldIndex) = try? descriptor(bold) {
        options += ",BoldFont={" + boldURL.lastPathComponent + "},BoldFeatures={Path={" + boldURL.deletingLastPathComponent().path + "/},FontIndex=" + String(boldIndex) + "}"
    }
    return (url.lastPathComponent, options)
}

func findTool(_ name: String) throws -> String {
    let configURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/MarkEdit Export/tools.json")
    if let data = try? Data(contentsOf: configURL), let paths = try? JSONDecoder().decode([String:String].self, from: data),
       let path = paths[name], FileManager.default.isExecutableFile(atPath: path) { return path }
    let dirs = ["/Library/TeX/texbin", "/opt/homebrew/bin", "/usr/local/bin"] + (ProcessInfo.processInfo.environment["PATH"] ?? "").split(separator: ":").map(String.init)
    for dir in dirs {
        let path = URL(fileURLWithPath: dir).appendingPathComponent(name).path
        if FileManager.default.isExecutableFile(atPath: path) { return path }
    }
    throw ExportError.failed("找不到 " + name + "，请安装 Pandoc 和 MacTeX 后重新运行安装器。")
}

func rejectRemoteImages(_ value: Any) throws {
    if let object = value as? [String:Any] {
        if object["t"] as? String == "Image", let content = object["c"] as? [Any],
           let target = content.last as? [Any], let path = target.first as? String {
            let scheme = URLComponents(string: path)?.scheme?.lowercased()
            if path.hasPrefix("//") || (scheme != nil && scheme != "file" && scheme != "data") {
                throw ExportError.failed("PDF 不读取远程图片，请先保存为本地图片。")
            }
        }
        for child in object.values { try rejectRemoteImages(child) }
    } else if let array = value as? [Any] {
        for child in array { try rejectRemoteImages(child) }
    }
}

func execute(_ executable: String, _ arguments: [String], directory: URL, log: URL) throws {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: executable)
    p.arguments = arguments
    p.currentDirectoryURL = directory
    var env = ProcessInfo.processInfo.environment
    env["PATH"] = ["/Library/TeX/texbin", "/opt/homebrew/bin", "/usr/local/bin", env["PATH"] ?? "/usr/bin:/bin"].joined(separator: ":")
    // Search the isolated work directory, then the installed TeX distribution.
    env["TEXINPUTS"] = directory.path + ":"
    p.environment = env
    FileManager.default.createFile(atPath: log.path, contents: nil)
    let handle = try FileHandle(forWritingTo: log)
    defer { try? handle.close() }
    p.standardOutput = handle
    p.standardError = handle
    try p.run()
    let deadline = Date().addingTimeInterval(90)
    while p.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.1) }
    if p.isRunning {
        let killer = Process(); killer.executableURL = URL(fileURLWithPath: "/usr/bin/pkill"); killer.arguments = ["-TERM", "-P", String(p.processIdentifier)]; if (try? killer.run()) != nil { killer.waitUntilExit() }
        p.terminate()
        throw ExportError.failed("编译超过 90 秒，请检查公式或宏包。")
    }
    if p.terminationStatus != 0 {
        let details = (try? String(contentsOf: log, encoding: .utf8)) ?? ""
        throw ExportError.failed("XeLaTeX 编译失败：\n" + String(details.suffix(5000)))
    }
}

func compile(_ requestURL: URL) {
    let url = requestURL.standardizedFileURL.resolvingSymlinksInPath()
    let root = jobsRoot.standardizedFileURL.resolvingSymlinksInPath()
    guard url.path.hasPrefix(root.path + "/"), url.pathExtension == "markeditexport" else { return }
    let response = url
    func write(_ object: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: object) {
            try? data.write(to: response)
            try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: response.path)
        }
    }
    do {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard ((attributes[.size] as? NSNumber)?.intValue ?? 0) <= 20_000_000 else { throw ExportError.failed("文档过大。") }
        let data = try Data(contentsOf: url)
        let request = try JSONDecoder().decode(ExportRequest.self, from: data)
        guard request.version == 1 else { throw ExportError.failed("导出请求版本不匹配。") }
        let work = FileManager.default.temporaryDirectory.appendingPathComponent("markedit-export-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        defer { try? FileManager.default.removeItem(at: work) }
        let sourceDir = request.sourcePath.map { URL(fileURLWithPath: $0).deletingLastPathComponent() } ?? work
        let cwd = work
        let output = work.appendingPathComponent("document.pdf")
        let log = work.appendingPathComponent("build.log")
        let rawTeX = request.sourcePath?.lowercased().hasSuffix(".tex") == true
        let source = work.appendingPathComponent(rawTeX ? "document.tex" : "document.md")
        try request.content.write(to: source, atomically: true, encoding: .utf8)
        let xelatex = try findTool("xelatex")
        if rawTeX {
            for _ in 0..<2 {
                try execute(xelatex, ["-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "-output-directory=" + work.path, source.path], directory: cwd, log: log)
            }
        } else {
            let pandoc = try findTool("pandoc")
            let ast = work.appendingPathComponent("document.json")
            let format = "markdown+hard_line_breaks-blank_before_header+tex_math_single_backslash+tex_math_double_backslash"
            try execute(pandoc, [source.path, "--from=" + format, "--to=json", "-o", ast.path], directory: cwd, log: log)
            try rejectRemoteImages(JSONSerialization.jsonObject(with: Data(contentsOf: ast)))
            let paper = request.options.paper == "Letter" ? "letter" : "a4"
            let serif = request.options.font == "serif"
            let cjk = try cjkFont(serif ? "Songti SC" : "Heiti SC")
            let latin = serif ? "Times New Roman" : "Arial"
            let size = ["10", "11", "12", "14"].contains(request.options.size ?? "") ? request.options.size! : "11"
            let margin = ["15", "20", "25", "30"].contains(request.options.margin ?? "") ? request.options.margin! : "20"
            let args = [source.path,
                "--from=markdown+hard_line_breaks-blank_before_header+tex_math_single_backslash+tex_math_double_backslash",
                "--pdf-engine=" + xelatex, "--pdf-engine-opt=-no-shell-escape",
                "--resource-path=" + sourceDir.path,
                "-V", "documentclass=extarticle", "-V", "papersize=" + paper,
                "-V", "geometry:margin=" + margin + "mm", "-V", "fontsize=" + size + "pt",
                "-V", "mainfont=" + latin, "-V", "CJKmainfont=" + cjk.path, "-V", "CJKmonofont=" + cjk.path, "-V", "CJKoptions=" + cjk.options,
                "-V", "linestretch=1.2", "-o", output.path]
            try execute(pandoc, args, directory: cwd, log: log)
        }
        let pdf = try Data(contentsOf: output)
        guard pdf.starts(with: Data("%PDF-".utf8)) else { throw ExportError.failed("未生成有效 PDF。") }
        write(["status": "done", "ok": true, "data": pdf.base64EncodedString(), "engine": "XeLaTeX"])
    } catch {
        write(["status": "done", "ok": false, "error": error.localizedDescription])
    }
}

final class Delegate: NSObject, NSApplicationDelegate {
    let queue = DispatchQueue(label: "markedit.export")
    var pending = 0
    func application(_ sender: NSApplication, openFiles filenames: [String]) {
        pending += 1
        queue.async {
            filenames.forEach { compile(URL(fileURLWithPath: $0)) }
            DispatchQueue.main.async {
                self.pending -= 1
                if self.pending == 0 { NSApp.terminate(nil) }
            }
        }
        sender.reply(toOpenOrPrint: .success)
    }
}

if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--compile" {
    compile(URL(fileURLWithPath: CommandLine.arguments[2]))
} else {
    let app = NSApplication.shared
    let delegate = Delegate()
    app.delegate = delegate
    app.setActivationPolicy(.prohibited)
    app.run()
}
