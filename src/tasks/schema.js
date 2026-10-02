import { z } from 'zod';

const EquipmentSchema = z.union([
  z.object({ mode: z.literal('none') }),
  z.object({
    mode:  z.literal('maximise'),
    stats: z.union([z.string().min(1), z.array(z.string().min(1))]),
  }),
  z.object({
    mode:   z.literal('outfit'),
    outfit: z.string().min(1),
  }),
]);



const ConditionSchema = z.object({
  quality:  z.string().min(1),
  operator: z.enum(['above', 'below', 'equals', 'at_least', 'at_most']),
  value:    z.number(),
});

const NestedStoryletSchema = z.object({
  branch: z.string().min(1),
});


const BranchSchema = z.object({
  priority:       z.number().int().positive(),
  branch:         z.string().min(1),
  condition:      ConditionSchema.optional(),
  nestedStorylet: NestedStoryletSchema.optional(),
});


const CardDrawSchema = z.object({
  type:  z.literal('draw_cards'),
  mode:  z.enum(['finite', 'infinite']),
  count: z.number().int().positive().optional(),
  autoPlayPriority: z.number().int().positive().optional(),
}).refine(data => {
  if (data.mode === 'finite' && !data.count) return false;
  return true;
}, {
  message: 'finite draw_cards step must have a count',
});


const UseItemSchema = z.object({
  type:   z.literal('use_item'),
  item:   z.string().min(1),
  branch: z.string().min(1),
  equipment: EquipmentSchema.optional(),
});


const StoryletSchema = z.object({
  target:         z.string().min(1),
  branch:         z.string().optional(),
  condition:      ConditionSchema.optional(),
  branches:       z.array(BranchSchema).optional(),
  exitBranches:   z.array(z.string()).optional(),
  nestedStorylet: NestedStoryletSchema.optional(),
  equipment:      EquipmentSchema.optional(),
}).refine(data => {
  if (!data.branch && (!data.branches || data.branches.length === 0)) {
    return false;
  }
  return true;
}, {
  message: 'Each storylet must have either "branch" or "branches" defined',
});


const StepSchema = z.union([
  StoryletSchema,
  CardDrawSchema,
  UseItemSchema,
]);

export const TaskSchema = z.object({
  name:                    z.string().min(1),
  location:                z.string().min(1),
  repeatUntilOutOfActions: z.boolean().default(true),
  maxIterations:           z.number().int().positive().optional(),
  retryDelaySeconds:       z.number().int().positive().default(10),
  minActionsToResume:      z.number().int().min(1).max(40).default(1),
  storylets:               z.array(StepSchema).min(1),
});

export function validateTask(raw) {
  const result = TaskSchema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.errors
      .map(e => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid task config:\n${errors}`);
  }

  return result.data;
}