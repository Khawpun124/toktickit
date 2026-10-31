import type { Prisma } from "@prisma/client";

/** Relations needed to build the Action Taken resource (api-spec section 1). */
export const ACTION_INCLUDE = {
  performedBy: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, isActive: true } },
} satisfies Prisma.ActionTakenInclude;

export type ActionWithPeople = Prisma.ActionTakenGetPayload<{ include: typeof ACTION_INCLUDE }>;

/** The response shape. `clientRequestId` is stored but never returned; no email addresses. */
export function toActionResource(a: ActionWithPeople) {
  return {
    id: a.id,
    ticketId: a.ticketId,
    actionAt: a.actionAt.toISOString(),
    description: a.description,
    result: a.result,
    status: a.status,
    performedBy: { id: a.performedBy.id, name: a.performedBy.name },
    assignee: { id: a.assignee.id, name: a.assignee.name, isActive: a.assignee.isActive },
    followUpRequired: a.followUpRequired,
    followUpNote: a.followUpNote,
    attachmentNotes: a.attachmentNotes,
    version: a.version,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}
