import SwiftUI

struct LicenseActivationView: View {
    @ObservedObject var manager: LicenseManager
    @State private var key = ""
    @FocusState private var keyFocused: Bool

    var body: some View {
        NavigationStack {
            ZStack {
                AnimatedHyperBackdrop()
                    .ignoresSafeArea()

                Color.black.opacity(0.35)
                    .ignoresSafeArea()

                ScrollViewReader { proxy in
                    ScrollView(showsIndicators: false) {
                        VStack(spacing: 0) {
                            Spacer(minLength: 40)

                            // Brand Logo Header
                            VStack(spacing: 8) {
                                ZStack {
                                    Circle()
                                        .fill(
                                            LinearGradient(
                                                colors: [AppTheme.accent.opacity(0.8), Color.purple.opacity(0.6)],
                                                startPoint: .topLeading,
                                                endPoint: .bottomTrailing
                                            )
                                        )
                                        .frame(width: 80, height: 80)
                                        .blur(radius: 12)

                                    Circle()
                                        .fill(Color.black.opacity(0.6))
                                        .frame(width: 76, height: 76)
                                        .overlay(
                                            Circle().stroke(
                                                LinearGradient(
                                                    colors: [AppTheme.accent, .white.opacity(0.5)],
                                                    startPoint: .topLeading,
                                                    endPoint: .bottomTrailing
                                                ),
                                                lineWidth: 1.5
                                            )
                                        )

                                    Image(systemName: "shield.checkered")
                                        .font(.system(size: 34, weight: .bold))
                                        .foregroundStyle(
                                            LinearGradient(
                                                colors: [.white, AppTheme.accent],
                                                startPoint: .top,
                                                endPoint: .bottom
                                            )
                                        )
                                }
                                .padding(.bottom, 6)

                                Text("RAXZY IOS")
                                    .font(.system(size: 32, weight: .black, design: .rounded))
                                    .tracking(4)
                                    .foregroundStyle(
                                        LinearGradient(
                                            colors: [.white, .white.opacity(0.85)],
                                            startPoint: .top,
                                            endPoint: .bottom
                                        )
                                    )

                                HStack(spacing: 8) {
                                    Text("v1.1.0")
                                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                                        .foregroundStyle(.white.opacity(0.6))
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 3)
                                        .background(Color.white.opacity(0.1), in: Capsule())

                                    Text("PACKAGE: RAXZY")
                                        .font(.system(size: 11, weight: .bold, design: .rounded))
                                        .tracking(1)
                                        .foregroundStyle(AppTheme.accent)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 3)
                                        .background(AppTheme.accent.opacity(0.15), in: Capsule())
                                        .overlay(Capsule().stroke(AppTheme.accent.opacity(0.3), lineWidth: 1))
                                }
                            }

                            // Activation Card
                            VStack(spacing: 20) {
                                HStack(spacing: 12) {
                                    ZStack {
                                        Circle()
                                            .fill(AppTheme.accent.opacity(0.2))
                                            .frame(width: 36, height: 36)
                                        Image(systemName: manager.isBusy ? "arrow.triangle.2.circlepath" : "key.fill")
                                            .foregroundStyle(AppTheme.accent)
                                            .font(.system(size: 16, weight: .bold))
                                    }

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(manager.isBusy ? "INITIALIZING…" : "LICENSE REQUIRED")
                                            .font(.system(size: 14, weight: .black, design: .rounded))
                                            .tracking(1.2)
                                            .foregroundStyle(.white)

                                        Text("Masukkan license key Anda untuk mendaftar")
                                            .font(.system(size: 11, weight: .medium, design: .rounded))
                                            .foregroundStyle(.white.opacity(0.6))
                                    }
                                    Spacer()
                                }

                                VStack(alignment: .leading, spacing: 8) {
                                    HStack {
                                        Text("ACCESS KEY")
                                            .font(.system(size: 10, weight: .bold, design: .rounded))
                                            .tracking(1.5)
                                            .foregroundStyle(.white.opacity(0.5))

                                        Spacer()

                                        Text("Key: raxzyios")
                                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                                            .foregroundStyle(AppTheme.accent)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(AppTheme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 6))
                                    }

                                    TextField("Masukkan Key (raxzyios)", text: $key)
                                        .focused($keyFocused)
                                        .textInputAutocapitalization(.never)
                                        .autocorrectionDisabled()
                                        .submitLabel(.done)
                                        .onSubmit { activate() }
                                        .font(.system(size: 15, weight: .semibold, design: .monospaced))
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 16)
                                        .frame(height: 52)
                                        .background(Color.black.opacity(0.5), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                                .stroke(
                                                    keyFocused
                                                        ? AppTheme.accent
                                                        : Color.white.opacity(0.15),
                                                    lineWidth: keyFocused ? 1.5 : 1
                                                )
                                                .shadow(color: keyFocused ? AppTheme.accent.opacity(0.5) : .clear, radius: 8)
                                        )
                                        .id("license-field")
                                }

                                Toggle("Simpan Key di Perangkat Ini", isOn: $manager.rememberKey)
                                    .font(.system(size: 12, weight: .bold, design: .rounded))
                                    .foregroundStyle(.white.opacity(0.8))
                                    .tint(AppTheme.accent)

                                Button(action: activate) {
                                    HStack(spacing: 9) {
                                        Image(systemName: manager.isBusy ? "hourglass" : "checkmark.seal.fill")
                                            .font(.system(size: 16, weight: .bold))
                                        Text(manager.isBusy ? "VERIFYING…" : "VERIFY & CONTINUE")
                                            .font(.system(size: 14, weight: .black, design: .rounded))
                                            .tracking(1.2)
                                    }
                                    .foregroundStyle(.white)
                                    .frame(maxWidth: .infinity, minHeight: 52)
                                    .background(
                                        LinearGradient(
                                            colors: [AppTheme.accent, AppTheme.accent.opacity(0.8)],
                                            startPoint: .leading,
                                            endPoint: .trailing
                                        ),
                                        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    )
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                                            .stroke(Color.white.opacity(0.3), lineWidth: 1)
                                    )
                                    .shadow(color: AppTheme.accent.opacity(0.4), radius: 12, y: 6)
                                }
                                .buttonStyle(.plain)
                                .disabled(key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || manager.isBusy)
                                .opacity(key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)

                                if let message = manager.message {
                                    HStack(spacing: 8) {
                                        Image(systemName: "info.circle.fill")
                                            .font(.system(size: 13, weight: .bold))
                                        Text(message)
                                            .font(.system(size: 12, weight: .bold, design: .rounded))
                                    }
                                    .foregroundStyle(message.contains("Activated") ? Color.green : Color.red)
                                    .multilineTextAlignment(.center)
                                    .frame(maxWidth: .infinity)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 10)
                                    .background(
                                        (message.contains("Activated") ? Color.green : Color.red).opacity(0.12),
                                        in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    )
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                                            .stroke((message.contains("Activated") ? Color.green : Color.red).opacity(0.3), lineWidth: 1)
                                    )
                                }
                            }
                            .padding(22)
                            .background(.ultraThinMaterial.opacity(0.85), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                            .background(Color.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 28, style: .continuous)
                                    .stroke(
                                        LinearGradient(
                                            colors: [.white.opacity(0.25), AppTheme.accent.opacity(0.3)],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        ),
                                        lineWidth: 1.2
                                    )
                            )
                            .padding(.horizontal, 20)
                            .padding(.top, 24)
                            .id("activation-card")

                            Spacer(minLength: 40)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.bottom, 28)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: keyFocused) { focused in
                        guard focused else { return }
                        withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("activation-card", anchor: .center) }
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func activate() {
        keyFocused = false
        manager.activate(key: key)
    }
}
