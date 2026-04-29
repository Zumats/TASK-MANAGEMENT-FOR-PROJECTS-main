/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

admin.initializeApp();

type NotificationPayload = {
  title: string;
  message: string;
  taskId?: string;
  assignedBy?: string;
};

type AdminDeleteUserData = {
  uid?: unknown;
};

type CreateAssignmentNotificationData = {
  assignedTo?: unknown;
  payload?: unknown;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

async function assertCallerIsAdmin(uid: string) {
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  const role = snap.data()?.role;
  if (role !== "admin") throw new HttpsError("permission-denied", "Admin access required");
}

export const adminDeleteUser = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required");
  await assertCallerIsAdmin(callerUid);

  const dataObj = asObject(request.data) as AdminDeleteUserData | null;
  const targetUid = typeof dataObj?.uid === "string" ? dataObj.uid.trim() : "";
  if (!targetUid) throw new HttpsError("invalid-argument", "uid is required");
  if (targetUid === callerUid) throw new HttpsError("failed-precondition", "Cannot delete yourself");

  const db = admin.firestore();

  // Delete notifications subcollection documents (best effort)
  const notifSnap = await db.collection(`users/${targetUid}/notifications`).get();
  if (!notifSnap.empty) {
    let batch = db.batch();
    let ops = 0;
    for (const d of notifSnap.docs) {
      batch.delete(d.ref);
      ops += 1;
      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  }

  // Delete Firestore user doc
  await db.doc(`users/${targetUid}`).delete();

  // Delete Firebase Auth user
  await admin.auth().deleteUser(targetUid);

  return { ok: true };
});

export const createAssignmentNotification = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required");
  await assertCallerIsAdmin(callerUid);

  const root = asObject(request.data) as CreateAssignmentNotificationData | null;
  const assignedTo = typeof root?.assignedTo === "string" ? root.assignedTo.trim() : "";
  if (!assignedTo) throw new HttpsError("invalid-argument", "assignedTo is required");

  const payloadObj = asObject(root?.payload) as Partial<NotificationPayload> | null;
  const payload = payloadObj ?? undefined;
  const title = String(payload?.title ?? "New task assigned").slice(0, 120);
  const message = String(payload?.message ?? "You have a new task.").slice(0, 500);
  const taskId = payload?.taskId ? String(payload.taskId).slice(0, 200) : undefined;

  const docRef = await admin
    .firestore()
    .collection(`users/${assignedTo}/notifications`)
    .add({
      title,
      message,
      taskId: taskId ?? null,
      assignedBy: callerUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  return { ok: true, id: docRef.id };
});

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
