import mongoose from "mongoose";
import { ProjectModel } from "../../../infrastructure/database/models/ProjectModel.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors/AppError.js";

export async function loadOwnedProject(projectId: string, userId: string) {
  if (!mongoose.isValidObjectId(projectId)) throw new BadRequestError("Invalid project ID");
  const project = await ProjectModel.findOne({ _id: projectId, userId });
  if (!project) throw new NotFoundError("Project not found");
  return project;
}
