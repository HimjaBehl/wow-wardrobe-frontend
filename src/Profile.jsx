import { signOut } from "firebase/auth";
import { auth } from "./firebase";

export default function Profile({ user }) {
  if (!user) return null;

  return (
    <div className="wow-account">
      <h2 className="wow-account__title">Account</h2>

      <div className="wow-account__card">
        <div className="wow-account__row">
          <div className="wow-account__label">Signed in as</div>
          <div className="wow-account__value">{user.email || user.displayName || "—"}</div>
        </div>

        {user.photoURL && (
          <img
            src={user.photoURL}
            alt="Profile"
            style={{ width: 56, height: 56, borderRadius: "50%", marginTop: 12 }}
          />
        )}

        <button
          className="btn btn-secondary"
          style={{ marginTop: 16, width: "100%" }}
          onClick={() => signOut(auth)}
        >
          Logout
        </button>
      </div>
    </div>
  );
}
