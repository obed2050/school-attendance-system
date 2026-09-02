import { prisma } from "../src/config/prisma";
import { seedSchoolSettings } from "../src/services/settings.service";
import { submitAttendance } from "../src/services/attendance.service";
import {
  getApi,
  seedBase,
  loginAsAdmin,
  createUserDb,
  loginAsUser,
  enrollFace,
  attendancePayload,
  FACE_EMBEDDING_A,
  FACE_EMBEDDING_B,
  STAFF_SIGNUP_FIELDS,
  SeededData,
  DEPT_NAMES
} from "./helpers";

const SOFT_DEV = "Software Development";
const BUILDING = "Building Construction";
const ELEC_TELECOM = "Electronics and Telecommunication";
const ORDINARY_LEVEL = "Ordinary Level";
const ADMINISTRATION = "Administration";

// Coordinates within 100 m of the seeded default school location
// (lat -1.9441, lng 30.0619) with good GPS accuracy.
const INSIDE_LOCATION = { latitude: -1.9441, longitude: 30.0619, accuracy: 10 };
const OUTSIDE_LOCATION = { latitude: -1.9441, longitude: 30.02, accuracy: 10 };
const POINT_500M = { latitude: -1.93961, longitude: 30.0619, accuracy: 10 };
const BOUNDARY_OUTSIDE = { latitude: -1.94319, longitude: 30.0619, accuracy: 5 };

async function createActiveStaff(phoneNumber: string) {
  const staff = await createUserDb({
    email: `active-${phoneNumber}@test.com`,
    phoneNumber,
    departmentId: seeded.departments[SOFT_DEV],
    status: "ACTIVE"
  });
  await enrollFace(staff.id);
  const token = await loginAsUser(staff.email, staff.password);
  return { staff, token };
}

let seeded: SeededData;

beforeEach(async () => {
  seeded = await seedBase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Staff signup", () => {
  it("1. creates a staff account and returns a success message", async () => {
    const res = await getApi()
      .post("/api/auth/signup")
      .send(STAFF_SIGNUP_FIELDS(seeded.departments[SOFT_DEV]));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe(
      "Account created successfully. Please wait for administrator approval."
    );
    expect(res.body.data).toBeUndefined();
  });

  it("2. signup creates a PENDING STAFF (never leaks the password hash)", async () => {
    const res = await getApi()
      .post("/api/auth/signup")
      .send(STAFF_SIGNUP_FIELDS(seeded.departments[SOFT_DEV]));
    expect(res.status).toBe(201);

    const user = await prisma.user.findUnique({ where: { email: "jane@test.com" } });
    expect(user).not.toBeNull();
    expect(user!.role).toBe("STAFF");
    expect(user!.status).toBe("PENDING");
    expect(user!.passwordHash).not.toBe("Password@123");
  });

  it("3. public signup cannot create an ADMIN even when role is spoofed", async () => {
    const body = {
      ...STAFF_SIGNUP_FIELDS(seeded.departments[SOFT_DEV]),
      role: "ADMIN",
      status: "ACTIVE"
    };
    const res = await getApi().post("/api/auth/signup").send(body);
    expect(res.status).toBe(201);

    const user = await prisma.user.findUnique({ where: { email: "jane@test.com" } });
    expect(user!.role).toBe("STAFF");
    expect(user!.status).toBe("PENDING");
  });

  it("validates password mismatch (422)", async () => {
    const body = {
      ...STAFF_SIGNUP_FIELDS(seeded.departments[SOFT_DEV]),
      confirm_password: "Different@123"
    };
    const res = await getApi().post("/api/auth/signup").send(body);
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
});

describe("Login", () => {
  it("4. pending staff cannot login", async () => {
    const staff = await createUserDb({
      email: "pending@test.com",
      phoneNumber: "2011111111",
      departmentId: seeded.departments[SOFT_DEV],
      status: "PENDING"
    });

    const res = await getApi()
      .post("/api/auth/login")
      .send({ email: staff.email, password: staff.password });
    expect(res.status).toBe(403);
    expect(res.body.message.toLowerCase()).toContain("pending");
  });

  it("5. rejected staff cannot login", async () => {
    const staff = await createUserDb({
      email: "rejected@test.com",
      phoneNumber: "2012222222",
      departmentId: seeded.departments[ELEC_TELECOM],
      status: "REJECTED"
    });

    const res = await getApi()
      .post("/api/auth/login")
      .send({ email: staff.email, password: staff.password });
    expect(res.status).toBe(403);
    expect(res.body.message.toLowerCase()).toContain("rejected");
  });

  it("6. approved staff can login and receives a JWT", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2013333333",
      departmentId: seeded.departments[ORDINARY_LEVEL],
      status: "PENDING"
    });
    await getApi()
      .patch(`/api/admin/users/${staff.id}/approve`)
      .set("Authorization", `Bearer ${await loginAsAdmin()}`);

    const res = await getApi()
      .post("/api/auth/login")
      .send({ email: staff.email, password: staff.password });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.role).toBe("STAFF");
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it("7. invalid credentials fail with a generic message", async () => {
    const res1 = await getApi()
      .post("/api/auth/login")
      .send({ email: "nobody@test.com", password: "Wrong@123" });
    expect(res1.status).toBe(401);
    expect(res1.body.message).toBe("Invalid email or password");

    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2013333334",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const res2 = await getApi()
      .post("/api/auth/login")
      .send({ email: staff.email, password: "WrongPassword@1" });
    expect(res2.status).toBe(401);
    expect(res2.body.message).toBe("Invalid email or password");
  });
});

describe("Public signup ignores role/status spoofing", () => {
  it("malicious signup with role=ADMIN still creates STAFF/PENDING", async () => {
    const body = {
      ...STAFF_SIGNUP_FIELDS(seeded.departments[SOFT_DEV]),
      email: "evil@test.com",
      phone_number: "2013333335",
      role: "ADMIN",
      status: "ACTIVE"
    };
    const res = await getApi().post("/api/auth/signup").send(body);
    expect(res.status).toBe(201);

    const user = await prisma.user.findUnique({ where: { email: "evil@test.com" } });
    expect(user!.role).toBe("STAFF");
    expect(user!.status).toBe("PENDING");
  });

  it("signup with an unknown role value still succeeds as STAFF", async () => {
    const body = {
      ...STAFF_SIGNUP_FIELDS(seeded.departments[SOFT_DEV]),
      email: "jane2@test.com",
      phone_number: "2013333336",
      role: "SUPERUSER"
    };
    const res = await getApi().post("/api/auth/signup").send(body);
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email: "jane2@test.com" } });
    expect(user!.role).toBe("STAFF");
    expect(user!.status).toBe("PENDING");
  });
});

describe("Public signup department restriction", () => {
  const PUBLIC_DEPARTMENTS = [SOFT_DEV, BUILDING, ELEC_TELECOM, ORDINARY_LEVEL];

  it("GET /api/departments returns only the 4 public departments", async () => {
    const res = await getApi().get("/api/departments");
    expect(res.status).toBe(200);
    const names = res.body.data.departments.map((d: { name: string }) => d.name);
    expect(names).toHaveLength(4);
    expect(names).toEqual(expect.arrayContaining(PUBLIC_DEPARTMENTS));
    expect(names).not.toContain(ADMINISTRATION);
  });

  it("public signup works with each of the 4 public departments", async () => {
    for (let i = 0; i < PUBLIC_DEPARTMENTS.length; i++) {
      const name = PUBLIC_DEPARTMENTS[i];
      const res = await getApi()
        .post("/api/auth/signup")
        .send({
          ...STAFF_SIGNUP_FIELDS(seeded.departments[name]),
          email: `staff${i}@test.com`,
          phone_number: `207000000${i}`
        });
      expect(res.status).toBe(201);

      const user = await prisma.user.findUnique({
        where: { email: `staff${i}@test.com` }
      });
      expect(user!.role).toBe("STAFF");
      expect(user!.status).toBe("PENDING");
    }
  });

  it("public signup using the Administration department is rejected", async () => {
    const res = await getApi()
      .post("/api/auth/signup")
      .send(STAFF_SIGNUP_FIELDS(seeded.departments[ADMINISTRATION]));
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Invalid department");

    const user = await prisma.user.findUnique({ where: { email: "jane@test.com" } });
    expect(user).toBeNull();
  });

  it("rejects a spoofed ADMIN signup targeting the Administration department", async () => {
    const res = await getApi()
      .post("/api/auth/signup")
      .send({
        ...STAFF_SIGNUP_FIELDS(seeded.departments[ADMINISTRATION]),
        role: "ADMIN",
        status: "ACTIVE"
      });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain("Invalid department");

    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    expect(admin!.email).toBe("admin@test.com");
  });

  it("admin can list all departments including Administration", async () => {
    const token = await loginAsAdmin();
    const res = await getApi()
      .get("/api/admin/departments")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const names = res.body.data.departments.map((d: { name: string }) => d.name);
    expect(names).toHaveLength(5);
    expect(names).toContain(ADMINISTRATION);
  });

  it("staff cannot list all departments via the admin endpoint (403)", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2033000001",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const staffToken = await loginAsUser(staff.email, staff.password);
    const res = await getApi()
      .get("/api/admin/departments")
      .set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });

  it("unauthenticated admin departments requests are rejected (401)", async () => {
    const res = await getApi().get("/api/admin/departments");
    expect(res.status).toBe(401);
  });
});

describe("Admin approval workflow", () => {
  it("8. admin can approve a pending staff", async () => {
    const staff = await createUserDb({
      email: "pending@test.com",
      phoneNumber: "2014444444",
      departmentId: seeded.departments[BUILDING],
      status: "PENDING"
    });

    const token = await loginAsAdmin();
    const res = await getApi()
      .patch(`/api/admin/users/${staff.id}/approve`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const user = await prisma.user.findUnique({ where: { id: staff.id } });
    expect(user!.status).toBe("ACTIVE");
  });

  it("9. staff cannot approve other staff (403)", async () => {
    const target = await createUserDb({
      email: "pending@test.com",
      phoneNumber: "2015555555",
      departmentId: seeded.departments[SOFT_DEV],
      status: "PENDING"
    });
    const approver = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2016666666",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });

    const staffToken = await loginAsUser(approver.email, approver.password);
    const res = await getApi()
      .patch(`/api/admin/users/${target.id}/approve`)
      .set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });

  it("admin can reject a pending staff", async () => {
    const staff = await createUserDb({
      email: "pending@test.com",
      phoneNumber: "2017777777",
      departmentId: seeded.departments[BUILDING],
      status: "PENDING"
    });
    const token = await loginAsAdmin();
    const res = await getApi()
      .patch(`/api/admin/users/${staff.id}/reject`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const user = await prisma.user.findUnique({ where: { id: staff.id } });
    expect(user!.status).toBe("REJECTED");
  });

  it("returns 404 when approving a non-existent user", async () => {
    const token = await loginAsAdmin();
    const res = await getApi()
      .patch("/api/admin/users/9999/approve")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("Admin create user (POST /api/admin/users)", () => {
  const createPayload = (
    deptId: number,
    overrides: Record<string, unknown> = {}
  ) => ({
    full_name: "New Staff",
    email: "created@test.com",
    phone_number: "2030000001",
    department_id: deptId,
    role: "STAFF",
    status: "ACTIVE",
    password: "Password@123",
    confirm_password: "Password@123",
    ...overrides
  });

  it("creates a STAFF/ACTIVE user when admin provides defaults", async () => {
    const token = await loginAsAdmin();
    const res = await getApi()
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${token}`)
      .send(createPayload(seeded.departments[SOFT_DEV]));

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("STAFF");
    expect(res.body.data.user.status).toBe("ACTIVE");
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const user = await prisma.user.findUnique({ where: { email: "created@test.com" } });
    expect(user!.role).toBe("STAFF");
    expect(user!.status).toBe("ACTIVE");
  });

  it("creates an ADMIN/ACTIVE user when the admin selects ADMIN role", async () => {
    const token = await loginAsAdmin();
    const res = await getApi()
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${token}`)
      .send(
        createPayload(seeded.departments[ADMINISTRATION], {
          full_name: "Second Admin",
          email: "admin2@test.com",
          phone_number: "2030000002",
          role: "ADMIN",
          status: "PENDING"
        })
      );

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("ADMIN");
    // Admin-created admins are forced ACTIVE regardless of requested status.
    expect(res.body.data.user.status).toBe("ACTIVE");
  });

  it("staff cannot create a user (403)", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2030000003",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const staffToken = await loginAsUser(staff.email, staff.password);
    const res = await getApi()
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${staffToken}`)
      .send(createPayload(seeded.departments[SOFT_DEV], { email: "created@test.com" }));
    expect(res.status).toBe(403);
  });

  it("rejects duplicate email and phone (409)", async () => {
    await createUserDb({
      email: "existing@test.com",
      phoneNumber: "2030000004",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const token = await loginAsAdmin();

    const dupEmail = await getApi()
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${token}`)
      .send(
        createPayload(seeded.departments[SOFT_DEV], {
          email: "existing@test.com",
          phone_number: "2030000005"
        })
      );
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.message).toContain("email");

    const dupPhone = await getApi()
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${token}`)
      .send(
        createPayload(seeded.departments[SOFT_DEV], {
          email: "unique@test.com",
          phone_number: "2030000004"
        })
      );
    expect(dupPhone.status).toBe(409);
    expect(dupPhone.body.message).toContain("phone");
  });

  it("rejects invalid department and password mismatch (422)", async () => {
    const token = await loginAsAdmin();
    const badDept = await getApi()
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${token}`)
      .send(createPayload(99999));
    expect(badDept.status).toBe(422);

    const badPw = await getApi()
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${token}`)
      .send(
        createPayload(seeded.departments[SOFT_DEV], {
          confirm_password: "Different@123"
        })
      );
    expect(badPw.status).toBe(422);
  });
});

describe("Admin user list (GET /api/admin/users)", () => {
  it("lists all users with search, filters and pagination", async () => {
    await createUserDb({
      fullName: "Alpha Staff",
      email: "alpha@test.com",
      phoneNumber: "2031000001",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await createUserDb({
      fullName: "Beta Staff",
      email: "beta@test.com",
      phoneNumber: "2031000002",
      departmentId: seeded.departments[BUILDING],
      status: "PENDING"
    });
    const adminToken = await loginAsAdmin();

    const all = await getApi()
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(all.status).toBe(200);
    // admin + alpha + beta
    expect(all.body.data.total).toBe(3);
    expect(all.body.data.items[0].passwordHash).toBeUndefined();

    const search = await getApi()
      .get("/api/admin/users?search=alpha")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(search.body.data.total).toBe(1);
    expect(search.body.data.items[0].fullName).toBe("Alpha Staff");

    const roleFilter = await getApi()
      .get("/api/admin/users?role=ADMIN")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(roleFilter.body.data.total).toBe(1);
    expect(roleFilter.body.data.items[0].role).toBe("ADMIN");

    const statusFilter = await getApi()
      .get("/api/admin/users?status=PENDING")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(statusFilter.body.data.total).toBe(1);
    expect(statusFilter.body.data.items[0].status).toBe("PENDING");

    const deptFilter = await getApi()
      .get(`/api/admin/users?department=${seeded.departments[BUILDING]}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deptFilter.body.data.total).toBe(1);
    expect(deptFilter.body.data.items[0].email).toBe("beta@test.com");

    const pageEmpty = await getApi()
      .get("/api/admin/users?page=99&limit=10")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(pageEmpty.body.data.items).toHaveLength(0);
  });

  it("staff cannot list users (403) — includes all admin endpoints", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2031000003",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const staffToken = await loginAsUser(staff.email, staff.password);

    const targets: { method: "get" | "patch" | "post"; url: string }[] = [
      { method: "get", url: "/api/admin/users" },
      { method: "post", url: "/api/admin/users" },
      { method: "patch", url: "/api/admin/users/1" },
      { method: "post", url: "/api/admin/users/1/reset-password" },
      { method: "get", url: "/api/admin/pending-users" },
      { method: "patch", url: "/api/admin/users/1/approve" },
      { method: "patch", url: "/api/admin/users/1/reject" },
      { method: "get", url: "/api/admin/attendance" },
      { method: "get", url: "/api/admin/attendance/export" },
      { method: "get", url: "/api/admin/reports/attendance/pdf" },
      { method: "get", url: "/api/admin/reports/attendance/excel" },
      { method: "get", url: "/api/admin/dashboard/stats" }
    ];

    for (const { method, url } of targets) {
      const req = getApi()[method](url).set("Authorization", `Bearer ${staffToken}`);
      const res = await (method === "patch" || method === "post"
        ? req.send({})
        : req);
      expect(res.status).toBe(403);
    }
  });

  it("unauthenticated requests to admin endpoints are rejected (401)", async () => {
    const res = await getApi().get("/api/admin/users");
    expect(res.status).toBe(401);
  });
});

describe("Admin user management (PATCH /api/admin/users/:id)", () => {
  it("updates staff details and persists changes", async () => {
    const staff = await createUserDb({
      fullName: "Before Name",
      email: "edit@test.com",
      phoneNumber: "2032000001",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const token = await loginAsAdmin();

    const res = await getApi()
      .patch(`/api/admin/users/${staff.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        full_name: "After Name",
        department_id: seeded.departments[BUILDING]
      });

    expect(res.status).toBe(200);
    expect(res.body.data.user.fullName).toBe("After Name");
    expect(res.body.data.user.department.name).toBe(BUILDING);

    const user = await prisma.user.findUnique({ where: { id: staff.id } });
    expect(user!.fullName).toBe("After Name");
    expect(user!.departmentId).toBe(seeded.departments[BUILDING]);
  });

  it("prevents duplicate email when editing (409)", async () => {
    await createUserDb({
      email: "other@test.com",
      phoneNumber: "2032000002",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const staff = await createUserDb({
      email: "edit@test.com",
      phoneNumber: "2032000003",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const token = await loginAsAdmin();
    const res = await getApi()
      .patch(`/api/admin/users/${staff.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "other@test.com" });
    expect(res.status).toBe(409);
  });

  it("allows editing an admin from ADMIN back to STAFF when another admin exists", async () => {
    const second = await createUserDb({
      fullName: "Second Admin",
      email: "admin2@test.com",
      phoneNumber: "2032000004",
      departmentId: seeded.departments[ADMINISTRATION],
      role: "ADMIN",
      status: "ACTIVE"
    });
    const token = await loginAsAdmin();

    const res = await getApi()
      .patch(`/api/admin/users/${second.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "STAFF" });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe("STAFF");
  });

  it("prevents removing the last active admin", async () => {
    const primary = seeded.admin;
    const token = await loginAsAdmin();

    // Try to demote the only active admin to STAFF.
    const demote = await getApi()
      .patch(`/api/admin/users/${primary.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "STAFF" });
    expect(demote.status).toBe(400);
    expect(demote.body.message).toContain(
      "At least one active administrator must remain"
    );

    // Try to reject/deactivate the only active admin.
    const reject = await getApi()
      .patch(`/api/admin/users/${primary.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "REJECTED" });
    expect(reject.status).toBe(400);
  });

  it("cannot modify a non-existent user (404)", async () => {
    const token = await loginAsAdmin();
    const res = await getApi()
      .patch("/api/admin/users/99999")
      .set("Authorization", `Bearer ${token}`)
      .send({ full_name: "Nobody" });
    expect(res.status).toBe(404);
  });

  it("resets a user password via dedicated endpoint", async () => {
    const staff = await createUserDb({
      email: "pwd@test.com",
      phoneNumber: "2032000005",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const token = await loginAsAdmin();

    const res = await getApi()
      .post(`/api/admin/users/${staff.id}/reset-password`)
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "NewPassword@123", confirm_password: "NewPassword@123" });
    expect(res.status).toBe(200);

    // Login with the new password works.
    const login = await getApi()
      .post("/api/auth/login")
      .send({ email: staff.email, password: "NewPassword@123" });
    expect(login.status).toBe(200);

    // Old password no longer works.
    const oldLogin = await getApi()
      .post("/api/auth/login")
      .send({ email: staff.email, password: staff.password });
    expect(oldLogin.status).toBe(401);
  });
});

describe("Attendance submission", () => {
  it("10. active staff can submit attendance", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2018888888",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await enrollFace(staff.id);
    const token = await loginAsUser(staff.email, staff.password);

    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(attendancePayload());
    expect(res.status).toBe(201);
    expect(res.body.data.submitted).toBe(true);
    expect(["PRESENT", "LATE"]).toContain(res.body.data.status);
  });

  it("11. staff cannot submit attendance twice on the same day (409)", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2019999999",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await enrollFace(staff.id);
    const token = await loginAsUser(staff.email, staff.password);

    const first = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(attendancePayload());
    expect(first.status).toBe(201);

    const second = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(attendancePayload());
    expect(second.status).toBe(409);
    expect(second.body.message).toBe("Attendance has already been recorded for today.");
  });

  it("admin token cannot submit attendance (staff-only route)", async () => {
    const adminToken = await loginAsAdmin();
    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });
});

describe("Authorization / role access", () => {
  it("12. staff cannot access admin pending-users API (403)", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2020000002",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const token = await loginAsUser(staff.email, staff.password);
    const res = await getApi()
      .get("/api/admin/pending-users")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("unauthenticated requests are rejected (401)", async () => {
    const res = await getApi().get("/api/admin/pending-users");
    expect(res.status).toBe(401);
  });

  it("13. admin can access admin APIs", async () => {
    const token = await loginAsAdmin();
    const res = await getApi()
      .get("/api/admin/pending-users")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("Admin attendance list with filters", () => {
  it("returns attendance records with related staff info + search", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2020000022",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await prisma.attendance.create({
      data: {
        userId: staff.id,
        attendanceDate: new Date("2026-01-15T00:00:00Z"),
        checkInTime: new Date("2026-01-15T07:45:00"),
        status: "PRESENT"
      }
    });

    const token = await loginAsAdmin();
    const res = await getApi()
      .get("/api/admin/attendance?search=active@test.com")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].user.fullName).toBe("Staff Member");
    expect(res.body.data.items[0].user.department.name).toBe(SOFT_DEV);
  });

  it("filters attendance by date, department and status", async () => {
    const staffA = await createUserDb({
      email: "a@test.com",
      phoneNumber: "2020000101",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const staffB = await createUserDb({
      email: "b@test.com",
      phoneNumber: "2020000102",
      departmentId: seeded.departments[BUILDING],
      status: "ACTIVE"
    });

    await prisma.attendance.create({
      data: {
        userId: staffA.id,
        attendanceDate: new Date("2026-01-15T00:00:00Z"),
        checkInTime: new Date("2026-01-15T07:30:00"),
        status: "PRESENT"
      }
    });
    await prisma.attendance.create({
      data: {
        userId: staffB.id,
        attendanceDate: new Date("2026-01-15T00:00:00Z"),
        checkInTime: new Date("2026-01-15T08:10:00"),
        status: "LATE"
      }
    });

    const token = await loginAsAdmin();

    const byStatus = await getApi()
      .get("/api/admin/attendance?status=LATE")
      .set("Authorization", `Bearer ${token}`);
    expect(byStatus.body.data.total).toBe(1);
    expect(byStatus.body.data.items[0].user.email).toBe("b@test.com");

    const byDept = await getApi()
      .get(`/api/admin/attendance?department=${seeded.departments[BUILDING]}`)
      .set("Authorization", `Bearer ${token}`);
    expect(byDept.body.data.total).toBe(1);

    const byDate = await getApi()
      .get("/api/admin/attendance?date=2026-01-15")
      .set("Authorization", `Bearer ${token}`);
    expect(byDate.body.data.total).toBe(2);

    const noMatch = await getApi()
      .get("/api/admin/attendance?date=2026-02-01")
      .set("Authorization", `Bearer ${token}`);
    expect(noMatch.body.data.total).toBe(0);
  });

  it("paginates attendance records", async () => {
    const staff = await createUserDb({
      email: "a@test.com",
      phoneNumber: "2020000103",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await prisma.attendance.create({
      data: {
        userId: staff.id,
        attendanceDate: new Date("2026-01-15T00:00:00Z"),
        checkInTime: new Date("2026-01-15T07:30:00"),
        status: "PRESENT"
      }
    });
    const token = await loginAsAdmin();
    const res = await getApi()
      .get("/api/admin/attendance?page=2&limit=1")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.totalPages).toBe(1);
  });
});

describe("Report exports", () => {
  function seedAttendance() {
    return createUserDb({
      email: "export@test.com",
      phoneNumber: "2020000099",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
  }

  it("returns the JSON export data with filtered records", async () => {
    const staff = await seedAttendance();
    await prisma.attendance.create({
      data: {
        userId: staff.id,
        attendanceDate: new Date("2026-01-15T00:00:00Z"),
        checkInTime: new Date("2026-01-15T07:30:00"),
        status: "PRESENT"
      }
    });
    const token = await loginAsAdmin();
    const res = await getApi()
      .get("/api/admin/attendance/export?status=PRESENT")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.records).toHaveLength(1);
    expect(res.body.data.records[0].user.email).toBe("export@test.com");
    expect(res.body.data.records[0].user.passwordHash).toBeUndefined();
  });

  it("returns a downloadable PDF", async () => {
    const staff = await seedAttendance();
    await prisma.attendance.create({
      data: {
        userId: staff.id,
        attendanceDate: new Date("2026-01-15T00:00:00Z"),
        checkInTime: new Date("2026-01-15T07:30:00"),
        status: "PRESENT"
      }
    });
    const token = await loginAsAdmin();
    const res = await getApi()
      .get("/api/admin/reports/attendance/pdf")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("attendance-report.pdf");
    expect(Number(res.headers["content-length"])).toBeGreaterThan(0);
  });

  it("returns a downloadable Excel file", async () => {
    const staff = await seedAttendance();
    await prisma.attendance.create({
      data: {
        userId: staff.id,
        attendanceDate: new Date("2026-01-15T00:00:00Z"),
        checkInTime: new Date("2026-01-15T07:30:00"),
        status: "PRESENT"
      }
    });
    const token = await loginAsAdmin();
    const res = await getApi()
      .get("/api/admin/reports/attendance/excel")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain(
      "spreadsheetml.sheet"
    );
    expect(res.headers["content-disposition"]).toContain("attendance-report.xlsx");
    expect(Number(res.headers["content-length"])).toBeGreaterThan(0);
  });

  it("unauthenticated export requests are rejected (401)", async () => {
    const res = await getApi().get("/api/admin/reports/attendance/pdf");
    expect(res.status).toBe(401);
  });
});

describe("Dashboard statistics", () => {
  it("14. statistics are correct for a selected date", async () => {
    const staff1 = await createUserDb({
      email: "s1@test.com",
      phoneNumber: "2020000011",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const staff2 = await createUserDb({
      email: "s2@test.com",
      phoneNumber: "2020000012",
      departmentId: seeded.departments[ELEC_TELECOM],
      status: "ACTIVE"
    });
    await createUserDb({
      email: "s3@test.com",
      phoneNumber: "2020000013",
      departmentId: seeded.departments[BUILDING],
      status: "ACTIVE"
    });
    await createUserDb({
      email: "s4@test.com",
      phoneNumber: "2020000014",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    // Should NOT be counted in active staff population:
    await createUserDb({
      email: "pending@test.com",
      phoneNumber: "2020000015",
      departmentId: seeded.departments[SOFT_DEV],
      status: "PENDING"
    });
    await createUserDb({
      email: "rejected@test.com",
      phoneNumber: "2020000016",
      departmentId: seeded.departments[SOFT_DEV],
      status: "REJECTED"
    });
    // Admin must NOT be counted as staff either.
    expect(DEPT_NAMES.includes(ADMINISTRATION)).toBe(true);

    await prisma.attendance.create({
      data: {
        userId: staff1.id,
        attendanceDate: new Date("2026-01-15T00:00:00Z"),
        checkInTime: new Date("2026-01-15T07:45:00"),
        status: "PRESENT"
      }
    });
    await prisma.attendance.create({
      data: {
        userId: staff2.id,
        attendanceDate: new Date("2026-01-15T00:00:00Z"),
        checkInTime: new Date("2026-01-15T08:15:00"),
        status: "LATE"
      }
    });

    const token = await loginAsAdmin();
    const res = await getApi()
      .get("/api/admin/dashboard/stats?date=2026-01-15")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total_staff).toBe(4);
    expect(res.body.data.present).toBe(2);
    expect(res.body.data.late).toBe(1);
    expect(res.body.data.absent).toBe(2);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the authenticated user without password", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2020000021",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const token = await loginAsUser(staff.email, staff.password);

    const res = await getApi()
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe("active@test.com");
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });
});

describe("App configuration endpoint", () => {
  it("returns the school name without auth", async () => {
    const res = await getApi().get("/api/config");
    expect(res.status).toBe(200);
    expect(typeof res.body.data.schoolName).toBe("string");
    expect(res.body.data.schoolName.length).toBeGreaterThan(0);
    expect(typeof res.body.data.serverTime).toBe("string");
    expect(res.body.data.timezone).toBe("Africa/Kigali");
  });
});

describe("School settings (singleton seed)", () => {
  it("1. seeding the school settings creates exactly one record", async () => {
    await seedSchoolSettings();
    expect(await prisma.schoolSettings.count()).toBe(1);
  });

  it("2. running the seed twice still leaves exactly one record", async () => {
    await seedSchoolSettings();
    await seedSchoolSettings();
    expect(await prisma.schoolSettings.count()).toBe(1);
    const record = await prisma.schoolSettings.findFirst();
    expect(record!.schoolName).toBe("My School");
    expect(record!.geofenceRadius).toBe(100);
    expect(record!.attendanceStartTime).toBe("07:30");
    expect(record!.lateAfterTime).toBe("08:00");
  });
});

describe("Admin settings API (GET/PUT /api/admin/settings)", () => {
  it("3. admin can read the singleton school settings (200)", async () => {
    const token = await loginAsAdmin();
    const res = await getApi()
      .get("/api/admin/settings")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.settings.schoolName).toBe("My School");
    expect(typeof res.body.data.settings.latitude).toBe("number");
    expect(await prisma.schoolSettings.count()).toBe(1);
  });

  it("4. staff cannot read or update settings (403)", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2034000001",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const token = await loginAsUser(staff.email, staff.password);

    const getRes = await getApi()
      .get("/api/admin/settings")
      .set("Authorization", `Bearer ${token}`);
    expect(getRes.status).toBe(403);

    const putRes = await getApi()
      .put("/api/admin/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ school_name: "Hacked" });
    expect(putRes.status).toBe(403);
  });

  it("unauthenticated settings requests are rejected (401)", async () => {
    expect((await getApi().get("/api/admin/settings")).status).toBe(401);
    expect(
      (await getApi().put("/api/admin/settings").send({ school_name: "X" })).status
    ).toBe(401);
  });

  it("5. admin can update school settings (200)", async () => {
    const token = await loginAsAdmin();
    const res = await getApi()
      .put("/api/admin/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        school_name: "Kigali International School",
        latitude: -1.9441,
        longitude: 30.0619,
        geofence_radius: 150,
        attendance_start_time: "07:15",
        late_after_time: "08:15"
      });

    expect(res.status).toBe(200);
    expect(res.body.data.settings.schoolName).toBe("Kigali International School");
    expect(res.body.data.settings.geofenceRadius).toBe(150);
    expect(res.body.data.settings.lateAfterTime).toBe("08:15");

    const db = await prisma.schoolSettings.findFirst();
    expect(db!.lateAfterTime).toBe("08:15");
    expect(await prisma.schoolSettings.count()).toBe(1);
  });

  it("6-9. invalid settings payloads are rejected (422)", async () => {
    const token = await loginAsAdmin();
    const cases = [
      {},
      { latitude: 91 },
      { latitude: -91 },
      { longitude: 181 },
      { longitude: -181 },
      { geofence_radius: 0 },
      { geofence_radius: 5 },
      { geofence_radius: 1001 },
      { attendance_start_time: "25:00" },
      { attendance_start_time: "8:00" },
      { late_after_time: "08:60" },
      { late_after_time: "8am" }
    ];
    for (const payload of cases) {
      const res = await getApi()
        .put("/api/admin/settings")
        .set("Authorization", `Bearer ${token}`)
        .send(payload);
      expect(res.status).toBe(422);
    }
  });

  it("10. late_after_time cannot be earlier than attendance_start_time", async () => {
    const token = await loginAsAdmin();

    const both = await getApi()
      .put("/api/admin/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ attendance_start_time: "08:00", late_after_time: "07:00" });
    expect(both.status).toBe(422);

    // Partial update merged against the existing seed (start 07:30).
    const partial = await getApi()
      .put("/api/admin/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ late_after_time: "06:00" });
    expect(partial.status).toBe(422);
  });
});

describe("DB-level one attendance per day", () => {
  it("11. duplicate attendance for the same user/date is rejected by the database", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2034000002",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await prisma.attendance.create({
      data: {
        userId: staff.id,
        attendanceDate: new Date("2026-01-15T00:00:00Z"),
        checkInTime: new Date("2026-01-15T07:30:00"),
        status: "PRESENT"
      }
    });

    await expect(
      prisma.attendance.create({
        data: {
          userId: staff.id,
          attendanceDate: new Date("2026-01-15T00:00:00Z"),
          checkInTime: new Date("2026-01-15T08:00:00"),
          status: "LATE"
        }
      })
    ).rejects.toThrow();
  });
});

describe("Device registration & attendance security", () => {
  it("a staff member can register a device and gets a one-time token", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2035000001",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const token = await loginAsUser(staff.email, staff.password);

    const res = await getApi()
      .post("/api/attendance/device-register")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.data.deviceToken).toHaveLength(64);
    expect(typeof res.body.data.deviceId).toBe("number");

    const user = await prisma.user.findUnique({ where: { id: staff.id } });
    expect(user!.deviceRegistrationStatus).toBe("REGISTERED");

    // Only the SHA-256 hash is stored, never the raw token.
    const devices = await prisma.device.findMany({ where: { userId: staff.id } });
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceTokenHash).not.toBe(res.body.data.deviceToken);
  });

  it("a user can register multiple devices", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2035000002",
      departmentId: seeded.departments[BUILDING],
      status: "ACTIVE"
    });
    const token = await loginAsUser(staff.email, staff.password);

    const first = await getApi()
      .post("/api/attendance/device-register")
      .set("Authorization", `Bearer ${token}`);
    const second = await getApi()
      .post("/api/attendance/device-register")
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data.deviceToken).not.toBe(second.body.data.deviceToken);

    const devices = await prisma.device.findMany({ where: { userId: staff.id } });
    expect(devices).toHaveLength(2);
  });

  it("attendance with a registered device token is device-verified", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2035000003",
      departmentId: seeded.departments[BUILDING],
      status: "ACTIVE"
    });
    await enrollFace(staff.id);
    const token = await loginAsUser(staff.email, staff.password);
    const reg = await getApi()
      .post("/api/attendance/device-register")
      .set("Authorization", `Bearer ${token}`);
    const raw = reg.body.data.deviceToken as string;

    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Device-Token", raw)
      .send(attendancePayload());
    expect(res.status).toBe(201);

    const record = await prisma.attendance.findFirst({ where: { userId: staff.id } });
    expect(record!.deviceVerified).toBe(true);
    expect(record!.verificationStatus).toBe("VERIFIED");
    expect(record!.locationVerified).toBe(true);
    expect(record!.locationVerifiedAt).not.toBeNull();
    expect(record!.locationVerificationResult).toBe("PASS");
    expect(record!.faceVerified).toBe(true);
    expect(record!.livenessVerified).toBe(true);
  });

  it("attendance without a device token is recorded but not device-verified", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2035000004",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await enrollFace(staff.id);
    const token = await loginAsUser(staff.email, staff.password);

    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(attendancePayload());
    expect(res.status).toBe(201);

    const record = await prisma.attendance.findFirst({ where: { userId: staff.id } });
    expect(record!.deviceVerified).toBe(false);
    expect(record!.verificationStatus).toBe("VERIFIED");
    expect(record!.locationVerified).toBe(true);
    expect(record!.faceVerified).toBe(true);
  });

  it("a mismatched device token is not device-verified when a device exists", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2035000005",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await enrollFace(staff.id);
    const token = await loginAsUser(staff.email, staff.password);
    await getApi()
      .post("/api/attendance/device-register")
      .set("Authorization", `Bearer ${token}`);

    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Device-Token", "a".repeat(64))
      .send(attendancePayload());
    expect(res.status).toBe(201);

    const record = await prisma.attendance.findFirst({ where: { userId: staff.id } });
    expect(record!.deviceVerified).toBe(false);
    expect(record!.verificationStatus).toBe("VERIFIED");
  });

  it("non-active staff cannot submit attendance (403)", async () => {
    const staff = await createUserDb({
      email: "pending@test.com",
      phoneNumber: "2035000006",
      departmentId: seeded.departments[SOFT_DEV],
      status: "PENDING"
    });

    await expect(submitAttendance(staff.id)).rejects.toMatchObject({
      statusCode: 403
    });
    expect(await prisma.attendance.count()).toBe(0);
  });
});

describe("Server-time attendance & sensitive data protection", () => {
  it("12. attendance is computed from server time, ignoring client-supplied values", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2036000001",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await enrollFace(staff.id);
    const token = await loginAsUser(staff.email, staff.password);

    const before = Date.now();
    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(
        attendancePayload({
          attendance_date: "1999-01-01",
          check_in_time: "1999-01-01T00:00:00.000Z",
          status: "LATE"
        })
      );
    expect(res.status).toBe(201);
    const after = Date.now();

    const record = await prisma.attendance.findFirst({ where: { userId: staff.id } });
    expect(record).not.toBeNull();
    expect(record!.attendanceDate.toISOString().slice(0, 10)).not.toBe("1999-01-01");
    expect(record!.checkInTime.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(record!.checkInTime.getTime()).toBeLessThanOrEqual(after + 1000);
    expect(["PRESENT", "LATE"]).toContain(record!.status);
  });

  it("13. passwords are never returned by user-facing endpoints", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2036000002",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });

    const endpoints = [
      () =>
        getApi()
          .post("/api/auth/login")
          .send({ email: staff.email, password: staff.password }),
      async () => {
        const token = await loginAsUser(staff.email, staff.password);
        return getApi()
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${token}`);
      }
    ];

    for (const make of endpoints) {
      const res = await make();
      expect(res.status).toBe(200);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain("passwordHash");
      expect(raw).not.toContain("password_hash");
    }
  });

  it("14. face reference data is never returned by user-facing endpoints", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2036000003",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await prisma.user.update({
      where: { id: staff.id },
      data: { faceReference: "secret-face-template", faceReferenceStatus: "REGISTERED" }
    });
    const token = await loginAsUser(staff.email, staff.password);

    const me = await getApi()
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    const meRaw = JSON.stringify(me.body);
    expect(meRaw).not.toContain('"faceReference":');
    expect(meRaw).not.toContain("face_reference");
    expect(meRaw).not.toContain("secret-face-template");

    const adminToken = await loginAsAdmin();
    const list = await getApi()
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    const listRaw = JSON.stringify(list.body);
    expect(listRaw).not.toContain('"faceReference":');
    expect(listRaw).not.toContain("face_reference");
    expect(listRaw).not.toContain("secret-face-template");
    // The status column (not the raw template) is what admins/staff may see.
    expect(meRaw).toContain("faceReferenceStatus");
  });

  it("15. device secrets are never returned outside the registration response", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2036000004",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const token = await loginAsUser(staff.email, staff.password);

    const reg = await getApi()
      .post("/api/attendance/device-register")
      .set("Authorization", `Bearer ${token}`);
    expect(reg.status).toBe(201);
    const raw = reg.body.data.deviceToken as string;

    const me = await getApi()
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    const meRaw = JSON.stringify(me.body);
    expect(meRaw).not.toContain(raw);
    expect(meRaw).not.toContain("deviceToken");
    expect(meRaw).not.toContain("deviceTokenHash");

    const adminToken = await loginAsAdmin();
    const list = await getApi()
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(JSON.stringify(list.body)).not.toContain("deviceTokenHash");

    const myAttendance = await getApi()
      .get("/api/attendance/me")
      .set("Authorization", `Bearer ${token}`);
    expect(JSON.stringify(myAttendance.body)).not.toContain("deviceTokenHash");
  });
});

describe("Static school QR (entry point only)", () => {
  it("16. the static QR contains no credentials or device secrets", async () => {
    const res = await getApi().get("/api/config/qr");
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(typeof data.school_name).toBe("string");
    expect(data.school_name.length).toBeGreaterThan(0);
    expect(data.attendance_url).toContain("/attendance");

    const raw = JSON.stringify(data).toLowerCase();
    for (const forbidden of [
      "password",
      "passwd",
      "jwt",
      "bearer",
      "token",
      "secret",
      "credential",
      "hash"
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });
});

describe("Geofence verification (GPS location)", () => {
  it("1. submission inside the school geofence is accepted", async () => {
    const { staff, token } = await createActiveStaff("2040000001");
    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(attendancePayload());
    expect(res.status).toBe(201);

    const record = await prisma.attendance.findFirst({ where: { userId: staff.id } });
    expect(record!.locationVerified).toBe(true);
    expect(record!.locationVerifiedAt).toBeInstanceOf(Date);
    expect(record!.locationVerificationResult).toBe("PASS");
  });

  it("2. submission outside the school geofence is rejected", async () => {
    const { staff, token } = await createActiveStaff("2040000002");
    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(OUTSIDE_LOCATION);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "Attendance can only be submitted on school premises."
    );
    expect(await prisma.attendance.count({ where: { userId: staff.id } })).toBe(0);
  });

  it("3. the geofence boundary is handled consistently", async () => {
    const inside = await createActiveStaff("2040000003");
    const insideRes = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${inside.token}`)
      .send(attendancePayload({ latitude: -1.94321, accuracy: 5 }));
    expect(insideRes.status).toBe(201);

    const outside = await createActiveStaff("2040000004");
    const outsideRes = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${outside.token}`)
      .send(BOUNDARY_OUTSIDE);
    expect(outsideRes.status).toBe(400);
    expect(outsideRes.body.message).toBe(
      "Attendance can only be submitted on school premises."
    );
  });

  it("4. an unusable accuracy fix is never trusted", async () => {
    const tooWide = await createActiveStaff("2040000005");
    const wideRes = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${tooWide.token}`)
      .send({ ...INSIDE_LOCATION, accuracy: 600 });
    expect(wideRes.status).toBe(400);
    expect(wideRes.body.message).toBe(
      "Your location could not be verified. Please move to an open area and try again."
    );

    const ambiguous = await createActiveStaff("2040000006");
    const ambiguousRes = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${ambiguous.token}`)
      .send({ ...INSIDE_LOCATION, accuracy: 150 });
    expect(ambiguousRes.status).toBe(400);
    expect(ambiguousRes.body.message).toBe(
      "Your location could not be verified. Please move to an open area and try again."
    );
  });

  it("5. missing location returns the permission-required error", async () => {
    const { staff, token } = await createActiveStaff("2040000007");
    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "Location permission is required for attendance."
    );
    expect(await prisma.attendance.count({ where: { userId: staff.id } })).toBe(0);
  });
});

describe("Settings-driven geofence (admin can adjust)", () => {
  it("6. updating the geofence radius changes what is inside", async () => {
    const { token } = await createActiveStaff("2041000001");

    const before = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(POINT_500M);
    expect(before.status).toBe(400);

    const adminToken = await loginAsAdmin();
    const put = await getApi()
      .put("/api/admin/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ geofence_radius: 1000 });
    expect(put.status).toBe(200);

    const after = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(attendancePayload({ latitude: -1.93961 }));
    expect(after.status).toBe(201);
  });

  it("7. updating the school coordinates moves the allowed area", async () => {
    const { token } = await createActiveStaff("2041000002");
    const origin = { latitude: 0, longitude: 0, accuracy: 10 };

    const before = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(origin);
    expect(before.status).toBe(400);

    const adminToken = await loginAsAdmin();
    const put = await getApi()
      .put("/api/admin/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ latitude: 0, longitude: 0 });
    expect(put.status).toBe(200);

    const after = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(attendancePayload({ latitude: 0, longitude: 0 }));
    expect(after.status).toBe(201);
  });

  it("8. updating the attendance start time rejects submissions before it", async () => {
    const { staff } = await createActiveStaff("2041000003");
    const adminToken = await loginAsAdmin();
    const put = await getApi()
      .put("/api/admin/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ attendance_start_time: "08:00" });
    expect(put.status).toBe(200);

    await expect(
      submitAttendance(staff.id, {
        location: INSIDE_LOCATION,
        embedding: FACE_EMBEDDING_A,
        liveness: true,
        now: new Date("2026-01-15T05:30:00.000Z")
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Attendance has not started yet."
    });

    const ok = await submitAttendance(staff.id, {
      location: INSIDE_LOCATION,
      embedding: FACE_EMBEDDING_A,
      liveness: true,
      now: new Date("2026-01-15T06:00:00.000Z")
    });
    expect(ok.submitted).toBe(true);
  });

  it("9. updating the late threshold changes the resulting status", async () => {
    const { staff } = await createActiveStaff("2041000004");
    const adminToken = await loginAsAdmin();
    const put = await getApi()
      .put("/api/admin/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ late_after_time: "09:00" });
    expect(put.status).toBe(200);

    const early = await submitAttendance(staff.id, {
      location: INSIDE_LOCATION,
      embedding: FACE_EMBEDDING_A,
      liveness: true,
      now: new Date("2026-01-15T06:30:00.000Z")
    });
    expect(early.status).toBe("PRESENT");

    const late = await submitAttendance(staff.id, {
      location: INSIDE_LOCATION,
      embedding: FACE_EMBEDDING_A,
      liveness: true,
      now: new Date("2026-01-16T07:00:00.000Z")
    });
    expect(late.status).toBe("LATE");
  });
});

describe("Geofence anti-spoofing & input validation", () => {
  it("10. a spoofed is_inside_school flag is never trusted", async () => {
    const { staff, token } = await createActiveStaff("2042000001");

    const spoofedInside = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(attendancePayload({ is_inside_school: true, isInsideSchool: true }));
    expect(spoofedInside.status).toBe(201);

    const spoofedOutside = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...OUTSIDE_LOCATION, is_inside_school: true });
    expect(spoofedOutside.status).toBe(400);
    expect(spoofedOutside.body.message).toBe(
      "Attendance can only be submitted on school premises."
    );
    expect(await prisma.attendance.count({ where: { userId: staff.id } })).toBe(1);
  });

  it("11. impossible latitudes are rejected", async () => {
    const { token } = await createActiveStaff("2042000002");
    for (const latitude of [100, -100, 91.5, -91.5]) {
      const res = await getApi()
        .post("/api/attendance")
        .set("Authorization", `Bearer ${token}`)
        .send({ latitude, longitude: 30.0619, accuracy: 10 });
      expect(res.status).toBe(422);
    }
  });

  it("12. impossible longitudes are rejected", async () => {
    const { token } = await createActiveStaff("2042000003");
    for (const longitude of [180.5, -180.5, 200, 999]) {
      const res = await getApi()
        .post("/api/attendance")
        .set("Authorization", `Bearer ${token}`)
        .send({ latitude: -1.9441, longitude, accuracy: 10 });
      expect(res.status).toBe(422);
    }
  });

  it("13. invalid accuracy values are rejected", async () => {
    const { token } = await createActiveStaff("2042000004");
    const cases = [
      { latitude: -1.9441, longitude: 30.0619, accuracy: 0 },
      { latitude: -1.9441, longitude: 30.0619, accuracy: -5 },
      { latitude: -1.9441, longitude: 30.0619, accuracy: 20000 },
      { latitude: -1.9441, longitude: 30.0619, accuracy: "abc" }
    ];
    for (const body of cases) {
      const res = await getApi()
        .post("/api/attendance")
        .set("Authorization", `Bearer ${token}`)
        .send(body);
      expect(res.status).toBe(422);
    }
  });

  it("15. only the verification result is persisted, never the coordinates", async () => {
    const { staff, token } = await createActiveStaff("2042000005");
    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(attendancePayload());
    expect(res.status).toBe(201);

    const record = await prisma.attendance.findFirst({ where: { userId: staff.id } });
    expect(record!.locationVerified).toBe(true);
    expect(record!.locationVerificationResult).toBe("PASS");
    const row = record as unknown as Record<string, unknown>;
    expect(row).not.toHaveProperty("latitude");
    expect(row).not.toHaveProperty("longitude");
    expect(row).not.toHaveProperty("accuracy");

    const columns = await prisma.$queryRawUnsafe<
      { table_name: string; column_name: string }[]
    >(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('attendance', 'users', 'devices')
    `);
    for (const column of columns) {
      const name = column.column_name.toLowerCase();
      expect(/lat|long|lon|accuracy/.test(name)).toBe(false);
    }
  });
});

describe("Face reference enrollment (biometric)", () => {
  it("staff can enroll a face reference once (200)", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2050000001",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const token = await loginAsUser(staff.email, staff.password);

    const res = await getApi()
      .put("/api/auth/face-reference")
      .set("Authorization", `Bearer ${token}`)
      .send({ embedding: FACE_EMBEDDING_A });
    expect(res.status).toBe(200);
    expect(res.body.data.faceReferenceStatus).toBe("REGISTERED");

    const user = await prisma.user.findUnique({ where: { id: staff.id } });
    expect(user!.faceReferenceStatus).toBe("REGISTERED");
    expect(user!.faceReference).toMatch(/^enc:v1:/);
    expect(user!.faceReference).not.toContain("1,0,0");
  });

  it("rejects malformed embeddings (422)", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2050000002",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const token = await loginAsUser(staff.email, staff.password);

    const cases = [
      { embedding: FACE_EMBEDDING_A.slice(0, 127) },
      { embedding: new Array(128).fill("x") },
      { embedding: FACE_EMBEDDING_A.map((v, i) => (i === 0 ? NaN : v)) },
      {},
      { embedding: 42 }
    ];
    for (const body of cases) {
      const res = await getApi()
        .put("/api/auth/face-reference")
        .set("Authorization", `Bearer ${token}`)
        .send(body);
      expect(res.status).toBe(422);
    }

    const user = await prisma.user.findUnique({ where: { id: staff.id } });
    expect(user!.faceReferenceStatus).toBe("NOT_REGISTERED");
  });

  it("re-enrollment without proving the existing face is denied (403)", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2050000003",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await enrollFace(staff.id);
    const token = await loginAsUser(staff.email, staff.password);

    const noProof = await getApi()
      .put("/api/auth/face-reference")
      .set("Authorization", `Bearer ${token}`)
      .send({ embedding: FACE_EMBEDDING_B });
    expect(noProof.status).toBe(403);
    expect(noProof.body.message).toBe("Identity verification failed. Please try again.");

    const wrongProof = await getApi()
      .put("/api/auth/face-reference")
      .set("Authorization", `Bearer ${token}`)
      .send({ embedding: FACE_EMBEDDING_B, current_embedding: FACE_EMBEDDING_B });
    expect(wrongProof.status).toBe(403);

    const rightProof = await getApi()
      .put("/api/auth/face-reference")
      .set("Authorization", `Bearer ${token}`)
      .send({ embedding: FACE_EMBEDDING_B, current_embedding: FACE_EMBEDDING_A });
    expect(rightProof.status).toBe(200);
  });
});

describe("Attendance identity verification (face + liveness)", () => {
  it("staff without a face reference cannot check in (403)", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2051000001",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const token = await loginAsUser(staff.email, staff.password);

    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(attendancePayload());
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Facial verification profile not set up");
    expect(await prisma.attendance.count({ where: { userId: staff.id } })).toBe(0);
  });

  it("a mismatched face is rejected and nothing is recorded", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2051000002",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await enrollFace(staff.id, FACE_EMBEDDING_B);
    const token = await loginAsUser(staff.email, staff.password);

    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(attendancePayload());
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Identity verification failed. Please try again.");
    expect(await prisma.attendance.count({ where: { userId: staff.id } })).toBe(0);

    const events = await prisma.securityEvent.findMany({
      where: { userId: staff.id, eventType: "FACE_VERIFICATION_FAILED" }
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].metadata).toBeNull();
  });

  it("a false liveness claim fails the check even with a matching face", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2051000003",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await enrollFace(staff.id);
    const token = await loginAsUser(staff.email, staff.password);

    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(attendancePayload({ liveness: false }));
    expect(res.status).toBe(403);
    expect(await prisma.attendance.count({ where: { userId: staff.id } })).toBe(0);

    const events = await prisma.securityEvent.findMany({
      where: { userId: staff.id, eventType: "LIVENESS_FAILED" }
    });
    expect(events.length).toBeGreaterThan(0);
  });

  it("a matching face with confirmed liveness records attendance (VERIFIED)", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2051000004",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await enrollFace(staff.id);
    const token = await loginAsUser(staff.email, staff.password);

    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(attendancePayload());
    expect(res.status).toBe(201);

    const record = await prisma.attendance.findFirst({ where: { userId: staff.id } });
    expect(record!.verificationStatus).toBe("VERIFIED");
    expect(record!.faceVerified).toBe(true);
    expect(record!.livenessVerified).toBe(true);
  });

  it("a daily selfie/capture is never persisted or returned", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2051000005",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await enrollFace(staff.id);
    const token = await loginAsUser(staff.email, staff.password);

    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(attendancePayload());
    expect(res.status).toBe(201);

    const raw = JSON.stringify(res.body).toLowerCase();
    expect(raw).not.toContain("photo");
    expect(raw).not.toContain("selfie");
    expect(raw).not.toContain("image");

    const record = await prisma.attendance.findFirst({ where: { userId: staff.id } });
    const row = record as unknown as Record<string, unknown>;
    expect(row).not.toHaveProperty("photo");
    expect(row).not.toHaveProperty("selfie");
    expect(row).not.toHaveProperty("capture");
  });
});

describe("Device lifecycle (PENDING -> ACTIVE -> REVOKED)", () => {
  it("provisioning sets an HttpOnly cookie and returns a PENDING device", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2052000001",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const token = await loginAsUser(staff.email, staff.password);

    const prov = await getApi()
      .post("/api/attendance/device")
      .set("Authorization", `Bearer ${token}`);
    expect(prov.status).toBe(201);
    expect(prov.body.data.status).toBe("PENDING");
    expect(prov.body.data.requiresVerification).toBe(true);

    const setCookie = prov.headers["set-cookie"] as unknown as string[];
    expect(setCookie).toBeDefined();
    const cookieStr = String(setCookie[0]);
    expect(cookieStr).toContain("school_device=");
    expect(cookieStr).toContain("HttpOnly");
    expect(cookieStr).toContain("Path=/");

    // Re-provisioning with the same cookie reuses the PENDING device.
    const cookie = cookieStr.split(";")[0];
    const again = await getApi()
      .post("/api/attendance/device")
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", cookie);
    expect(again.status).toBe(200);
    expect(again.body.data.deviceId).toBe(prov.body.data.deviceId);
    expect(await prisma.device.count({ where: { userId: staff.id } })).toBe(1);
  });

  it("an unknown (PENDING) device becomes ACTIVE after a live face match", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2052000002",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await enrollFace(staff.id);
    const token = await loginAsUser(staff.email, staff.password);
    const reg = await getApi()
      .post("/api/attendance/device-register")
      .set("Authorization", `Bearer ${token}`);
    const deviceId = reg.body.data.deviceId as number;
    const raw = reg.body.data.deviceToken as string;

    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Device-Token", raw)
      .send(attendancePayload());
    expect(res.status).toBe(201);

    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    expect(device!.status).toBe("ACTIVE");
    const record = await prisma.attendance.findFirst({ where: { userId: staff.id } });
    expect(record!.deviceVerified).toBe(true);

    const events = await prisma.securityEvent.findMany({
      where: { userId: staff.id, eventType: "DEVICE_REGISTERED" }
    });
    expect(events.length).toBe(1);
  });

  it("a revoked device is denied and no attendance is recorded", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2052000003",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await enrollFace(staff.id);
    const token = await loginAsUser(staff.email, staff.password);
    const reg = await getApi()
      .post("/api/attendance/device-register")
      .set("Authorization", `Bearer ${token}`);
    const deviceId = reg.body.data.deviceId as number;
    const raw = reg.body.data.deviceToken as string;

    const adminToken = await loginAsAdmin();
    const revoked = await getApi()
      .post(`/api/admin/users/${staff.id}/devices/${deviceId}/revoke`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(revoked.status).toBe(200);

    const res = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Device-Token", raw)
      .send(attendancePayload());
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("revoked");
    expect(await prisma.attendance.count({ where: { userId: staff.id } })).toBe(0);

    // A fresh device lets the same staff member back in.
    const fresh = await getApi()
      .post("/api/attendance/device-register")
      .set("Authorization", `Bearer ${token}`);
    const ok = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Device-Token", fresh.body.data.deviceToken)
      .send(attendancePayload());
    expect(ok.status).toBe(201);
  });

  it("admin can list a user's devices without exposing the token hash", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2052000004",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    const token = await loginAsUser(staff.email, staff.password);
    await getApi()
      .post("/api/attendance/device-register")
      .set("Authorization", `Bearer ${token}`);

    const adminToken = await loginAsAdmin();
    const res = await getApi()
      .get(`/api/admin/users/${staff.id}/devices`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.devices).toHaveLength(1);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("deviceTokenHash");
    expect(raw).toContain("PENDING");
  });
});

describe("Admin biometric reset", () => {
  it("reset forces re-enrollment before the next check-in", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2053000001",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await enrollFace(staff.id);
    const token = await loginAsUser(staff.email, staff.password);

    const adminToken = await loginAsAdmin();
    const reset = await getApi()
      .post(`/api/admin/users/${staff.id}/face-reference/reset`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(reset.status).toBe(200);
    expect(reset.body.data.user.faceReferenceStatus).toBe("NOT_REGISTERED");

    const blocked = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(attendancePayload());
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toContain("Facial verification profile not set up");
    expect(await prisma.attendance.count({ where: { userId: staff.id } })).toBe(0);

    const reenroll = await getApi()
      .put("/api/auth/face-reference")
      .set("Authorization", `Bearer ${token}`)
      .send({ embedding: FACE_EMBEDDING_A });
    expect(reenroll.status).toBe(200);

    const ok = await getApi()
      .post("/api/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send(attendancePayload());
    expect(ok.status).toBe(201);
  });
});

describe("Concurrent submissions (unique constraint)", () => {
  it("two simultaneous submissions yield exactly one success (201) and one conflict (409)", async () => {
    const staff = await createUserDb({
      email: "active@test.com",
      phoneNumber: "2054000001",
      departmentId: seeded.departments[SOFT_DEV],
      status: "ACTIVE"
    });
    await enrollFace(staff.id);
    const token = await loginAsUser(staff.email, staff.password);

    const [a, b] = await Promise.all([
      getApi()
        .post("/api/attendance")
        .set("Authorization", `Bearer ${token}`)
        .send(attendancePayload()),
      getApi()
        .post("/api/attendance")
        .set("Authorization", `Bearer ${token}`)
        .send(attendancePayload())
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await prisma.attendance.count({ where: { userId: staff.id } })).toBe(1);
  });
});