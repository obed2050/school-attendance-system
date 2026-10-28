
import { Response } from "express";
import {
  signup,
  login,
  getCurrentUser,
  setFaceReference
} from "../services/auth.service";
import { FaceReferenceInput } from "../validators/auth";
import { success } from "../utils/apiResponse";
import { catchAsync } from "../utils/catchAsync";

export const signupHandler = catchAsync(async (req, res: Response) => {
  await signup(req.body);
  success(
    res,
    201,
    "Account created successfully. Please wait for administrator approval."
  );
});

export const loginHandler = catchAsync(async (req, res: Response) => {
  const { token, user } = await login(req.body);
  success(res, 200, "Login successful", { token, user });
});

export const meHandler = catchAsync(async (req, res: Response) => {
  const user = await getCurrentUser(req.user!.id);
  success(res, 200, "Current user retrieved", { user });
});

export const faceReferenceHandler = catchAsync(async (req, res: Response) => {
  const body = req.body as FaceReferenceInput;
  const result = await setFaceReference(
    req.user!.id,
    body.embedding,
    body.current_embedding
  );
  success(res, 200, "Face profile updated successfully", result);
});
