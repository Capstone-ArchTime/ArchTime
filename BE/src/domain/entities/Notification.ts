// In-app notifications: what the bell in the header lists. The server stores what happened (its kind and the values
// that describe it); the app words it in the reader's language, so a notification reads right after a language change.

/** What a notification is about. One kind for now; each kind lists the params it carries. */
export type NotificationKind = "conformance.findings";

/** conformance.findings: the conformance check found problems nobody was told about yet in a workspace. */
export interface ConformanceFindingsParams {
  projectId: string;
  projectName: string;
  /** New findings of this check (a problem in several commits counts once per commit). */
  count: number;
}

export interface INotification {
  id: string;
  userId: string;
  kind: NotificationKind;
  params: ConformanceFindingsParams;
  /** Where the notification leads in the app (a path, never an outside address). */
  link: string;
  createdAt: Date;
  readAt: Date | null;
}

export type NewNotification = Omit<INotification, "id" | "createdAt" | "readAt">;
