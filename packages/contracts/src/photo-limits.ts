// The single definition of the two citizen-photo size limits, imported by
// the server-side seed-photo check and later client-side compression so the
// numbers are never restated in more than one place.

export const MAX_PHOTO_BYTES = 409_600;
export const MAX_PHOTO_SIDE_PX = 1024;
