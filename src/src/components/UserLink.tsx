import { Link } from 'react-router-dom';

interface UserLinkProps {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  /** Show the avatar circle next to the name. Default: false */
  showAvatar?: boolean;
  /** Avatar size in pixels. Default: 28 */
  avatarSize?: number;
  /** Extra CSS classes on the wrapper <Link>. */
  className?: string;
}

/**
 * Clickable user name that navigates to their public profile.
 * Renders as an inline link styled consistently across the app.
 */
export default function UserLink({
  userId,
  displayName,
  avatarUrl,
  showAvatar = false,
  avatarSize = 28,
  className = ''
}: UserLinkProps) {
  const initials = displayName?.charAt(0).toUpperCase() || '?';

  return (
    <Link
      to={`/profile/${userId}`}
      className={`inline-flex items-center gap-1.5 hover:text-gridiron-gold transition-colors ${className}`}
      onClick={e => e.stopPropagation()}
    >
      {showAvatar && (
        avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="rounded-full object-cover flex-shrink-0"
            style={{ width: avatarSize, height: avatarSize }}
          />
        ) : (
          <div
            className="rounded-full bg-brand-800 flex items-center justify-center font-bold text-white flex-shrink-0"
            style={{ width: avatarSize, height: avatarSize, fontSize: avatarSize * 0.4 }}
          >
            {initials}
          </div>
        )
      )}
      <span>{displayName}</span>
    </Link>
  );
}
