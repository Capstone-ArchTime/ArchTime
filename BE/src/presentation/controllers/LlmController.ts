import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { AdminLlmUseCases, UserLlmUseCases } from "../../application/use-cases/llm/LlmUseCases.js";
import { sendSuccess } from "../../shared/utils/apiResponse.js";
import { UnauthorizedError } from "../../shared/errors/AppError.js";

const userIdOf = (req: Request): string => {
  const id = (req as any).user?.userId;
  if (!id) throw new UnauthorizedError("Authentication required.");
  return id;
};

/** Wraps a handler so thrown errors reach the error middleware. */
const handle = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/** Models a user can pick and the user's own AI usage. */
export class LlmController {
  constructor(private readonly useCases: UserLlmUseCases) {}

  public listModels = handle(async (req, res) => {
    sendSuccess(res, await this.useCases.listModels(userIdOf(req), req.query as Record<string, unknown>));
  });

  public myRuns = handle(async (req, res) => {
    const { runs, totals, meta } = await this.useCases.myRuns(userIdOf(req), req.query as Record<string, unknown>);
    sendSuccess(res, { runs, totals }, { meta });
  });

  public feedback = handle(async (req, res) => {
    sendSuccess(res, { run: await this.useCases.feedback(userIdOf(req), req.params.runId, req.body) });
  });
}

/** Model registry, usage, comparison and benchmarks for system administrators. */
export class AdminLlmController {
  constructor(private readonly useCases: AdminLlmUseCases) {}

  public list = handle(async (_req, res) => { sendSuccess(res, await this.useCases.list()); });

  public create = handle(async (req, res) => {
    sendSuccess(res, { model: await this.useCases.create(req.body, userIdOf(req)) }, { statusCode: 201, message: "Model added." });
  });

  public update = handle(async (req, res) => {
    sendSuccess(res, { model: await this.useCases.update(req.params.id, req.body, userIdOf(req)) }, { message: "Model updated." });
  });

  public remove = handle(async (req, res) => {
    const result = await this.useCases.remove(req.params.id, userIdOf(req));
    sendSuccess(res, result, { message: result.archived ? "The model has runs on record, so it was turned off and hidden instead of deleted." : "Model deleted." });
  });

  public setDefault = handle(async (req, res) => {
    sendSuccess(res, { model: await this.useCases.setDefault(req.params.id, userIdOf(req)) }, { message: "Default model changed." });
  });

  public test = handle(async (req, res) => { sendSuccess(res, await this.useCases.test(req.params.id, userIdOf(req))); });

  public testAll = handle(async (req, res) => { sendSuccess(res, await this.useCases.testAll(userIdOf(req))); });

  public discover = handle(async (req, res) => { sendSuccess(res, await this.useCases.discover(req.body)); });

  public usage = handle(async (req, res) => { sendSuccess(res, await this.useCases.usage(req.query as Record<string, unknown>)); });

  public leaderboard = handle(async (req, res) => { sendSuccess(res, await this.useCases.leaderboard(req.query as Record<string, unknown>)); });

  public benchmarkTargets = handle(async (_req, res) => { sendSuccess(res, await this.useCases.benchmarkTargets()); });

  public startBenchmark = handle(async (req, res) => {
    sendSuccess(res, await this.useCases.startBenchmark(req.body, userIdOf(req)), { statusCode: 202, message: "Benchmark queued." });
  });

  public benchmarks = handle(async (_req, res) => { sendSuccess(res, await this.useCases.benchmarks()); });

  public benchmark = handle(async (req, res) => { sendSuccess(res, await this.useCases.benchmark(req.params.id)); });
}
