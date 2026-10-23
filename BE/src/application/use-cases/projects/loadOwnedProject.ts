import mongoose from "mongoose";
import { ProjectModel } from "../../../infrastructure/database/models/ProjectModel.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors/AppError.js";

/**
 * Loads a project by id. Who may act on it is decided before this, by the projectRole middleware on the route
 * (owner, organization owner, maintainer, member); this only checks the id and that the project exists.
 */
export async function loadProject(projectId: string) {
  if (!mongoose.isValidObjectId(projectId)) throw new BadRequestError("Invalid workspace ID");
  const project = await ProjectModel.findOne({ _id: projectId });
  if (!project) throw new NotFoundError("Workspace not found");
  return project;
}
