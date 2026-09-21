import SwiftUI

struct LoginView: View {
    @Environment(SessionStore.self) private var session
    @State private var username = ""
    @State private var password = ""
    @FocusState private var focus: Field?

    private enum Field { case username, password }

    private var canSubmit: Bool {
        !username.trimmingCharacters(in: .whitespaces).isEmpty
            && !password.isEmpty
            && !session.isWorking
    }

    var body: some View {
        ZStack {
            Color(hex: "#1f1f1e").ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer(minLength: 0)

                VStack(spacing: 6) {
                    Text("Sneaky Social")
                        .font(.largeTitle.weight(.bold))
                        .foregroundStyle(.white)
                    Text("Sign in to carry on")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.6))
                }

                VStack(spacing: 12) {
                    TextField("Username", text: $username)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focus, equals: .username)
                        .submitLabel(.next)
                        .onSubmit { focus = .password }

                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .focused($focus, equals: .password)
                        .submitLabel(.go)
                        .onSubmit(submit)
                }
                .textFieldStyle(.plain)
                .padding(14)
                .background(.white.opacity(0.08), in: .rect(cornerRadius: 16))
                .foregroundStyle(.white)

                if let error = session.loginError {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(Color(hex: "#fca5a5"))
                        .multilineTextAlignment(.center)
                        .transition(.opacity)
                }

                Button(action: submit) {
                    Group {
                        if session.isWorking {
                            ProgressView().tint(.white)
                        } else {
                            Text("Sign in").font(.headline)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(hex: "#a04d89"))
                .disabled(!canSubmit)

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 28)
            .animation(.snappy, value: session.loginError)
        }
        .onAppear { focus = .username }
    }

    private func submit() {
        guard canSubmit else { return }
        Haptics.tap()
        Task { await session.logIn(username: username, password: password) }
    }
}
