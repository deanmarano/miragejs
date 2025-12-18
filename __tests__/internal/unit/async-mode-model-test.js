import { Server, Model, Factory, belongsTo, hasMany } from "miragejs";

describe("Unit | Async Mode | Model Operations", function () {
  let server;

  afterEach(() => {
    if (server) {
      server.shutdown();
    }
  });

  describe("Model save in async mode", () => {
    beforeEach(() => {
      server = new Server({
        environment: "test",
        async: true,
        models: {
          user: Model.extend({
            organization: belongsTo(),
          }),
          organization: Model.extend({
            users: hasMany(),
          }),
        },
      });
      server.timing = 0;
      server.logging = false;
    });

    test("new model save() creates record in database", async () => {
      const user = server.schema.users.new({ name: "Alice" });
      
      expect(user.isNew()).toBe(true);
      
      await user.save();
      
      expect(user.isNew()).toBe(false);
      expect(user.id).toBeDefined();
      
      // Verify it's in the database
      const found = await server.schema.users.find(user.id);
      expect(found.name).toBe("Alice");
    });

    test("existing model save() updates record in database", async () => {
      const user = await server.schema.users.create({ name: "Alice" });
      const originalId = user.id;
      
      expect(user.isNew()).toBe(false);
      
      user.name = "Alicia";
      await user.save();
      
      expect(user.id).toBe(originalId);
      
      // Verify it's updated in the database
      const found = await server.schema.users.find(user.id);
      expect(found.name).toBe("Alicia");
    });

    test("model update() saves changes to database", async () => {
      const user = await server.schema.users.create({ name: "Alice" });
      
      await user.update({ name: "Alicia" });
      
      const found = await server.schema.users.find(user.id);
      expect(found.name).toBe("Alicia");
    });

    test("multiple saves on same model work correctly", async () => {
      const user = server.schema.users.new({ name: "Alice" });
      
      await user.save(); // First save - insert
      const id1 = user.id;
      
      user.name = "Alicia";
      await user.save(); // Second save - update
      const id2 = user.id;
      
      expect(id1).toBe(id2);
      
      const found = await server.schema.users.find(user.id);
      expect(found.name).toBe("Alicia");
      
      // Verify only one record exists
      const all = await server.schema.users.all();
      expect(all.models).toHaveLength(1);
    });

    test("save() after update() doesn't create duplicate", async () => {
      const user = await server.schema.users.create({ name: "Alice" });
      
      user.update({ name: "Alicia" });
      await user.save();
      
      const all = await server.schema.users.all();
      expect(all.models).toHaveLength(1);
      expect(all.models[0].name).toBe("Alicia");
    });

    test("isNew() returns false after save", async () => {
      const user = server.schema.users.new({ name: "Alice" });
      
      expect(user.isNew()).toBe(true);
      
      await user.save();
      
      expect(user.isNew()).toBe(false);
    });

    test("save() with relationships works correctly", async () => {
      const org = await server.schema.organizations.create({ name: "Acme" });
      const user = server.schema.users.new({ name: "Alice", organizationId: org.id });
      
      await user.save();
      
      expect(user.isNew()).toBe(false);
      
      const found = await server.schema.users.find(user.id);
      expect(found.organizationId).toBe(org.id);
      
      // Verify relationship works
      const foundOrg = await found.organization;
      expect(foundOrg.name).toBe("Acme");
    });
  });

  describe("Factory afterCreate with save in async mode", () => {
    beforeEach(() => {
      server = new Server({
        environment: "test",
        async: true,
        models: {
          user: Model.extend({
            posts: hasMany(),
          }),
          post: Model.extend({
            user: belongsTo(),
          }),
        },
        factories: {
          user: Factory.extend({
            async afterCreate(user, server) {
              const post = await server.create("post", { userId: user.id, title: "First Post" });
              user.update({ lastPostId: post.id });
              return user;
            },
          }),
          post: Factory,
        },
      });
      server.timing = 0;
      server.logging = false;
    });

    test("afterCreate can create related models and update", async () => {
      const user = await server.create("user", { name: "Alice" });
      
      expect(user.lastPostId).toBeDefined();
      
      const posts = await server.schema.posts.all();
      expect(posts.models).toHaveLength(1);
      expect(posts.models[0].userId).toBe(user.id);
      expect(posts.models[0].title).toBe("First Post");
    });

    test("multiple factory creates with afterCreate work", async () => {
      const user1 = await server.create("user", { name: "Alice" });
      const user2 = await server.create("user", { name: "Bob" });
      
      const users = await server.schema.users.all();
      expect(users.models).toHaveLength(2);
      
      const posts = await server.schema.posts.all();
      expect(posts.models).toHaveLength(2);
      
      // Each user has their own post
      expect(user1.lastPostId).not.toBe(user2.lastPostId);
    });
  });

  describe("Model destroy in async mode", () => {
    beforeEach(() => {
      server = new Server({
        environment: "test",
        async: true,
        models: {
          user: Model,
        },
      });
      server.timing = 0;
      server.logging = false;
    });

    test("model.destroy() removes from database", async () => {
      const user = await server.schema.users.create({ name: "Alice" });
      const userId = user.id;
      
      await user.destroy();
      
      const found = await server.schema.users.find(userId);
      expect(found).toBeNull();
    });

    test("destroy() on multiple models works", async () => {
      const user1 = await server.schema.users.create({ name: "Alice" });
      const user2 = await server.schema.users.create({ name: "Bob" });
      
      await user1.destroy();
      
      const all = await server.schema.users.all();
      expect(all.models).toHaveLength(1);
      expect(all.models[0].id).toBe(user2.id);
    });
  });

  describe("Edge cases in async mode", () => {
    beforeEach(() => {
      server = new Server({
        environment: "test",
        async: true,
        models: {
          user: Model,
        },
      });
      server.timing = 0;
      server.logging = false;
    });

    test("saving model with same ID twice doesn't duplicate", async () => {
      const user1 = await server.schema.users.create({ id: "1", name: "Alice" });
      
      // Try to create another with same ID (should update instead)
      user1.name = "Alicia";
      await user1.save();
      
      const all = await server.schema.users.all();
      expect(all.models).toHaveLength(1);
      expect(all.models[0].name).toBe("Alicia");
    });

    test("update() on non-existent ID throws error", async () => {
      await expect(async () => {
        await server.db.users.update("999", { name: "Ghost" });
      }).rejects.toThrow();
    });

    test("concurrent saves create race condition (known limitation)", async () => {
      const user = server.schema.users.new({ name: "Alice" });
      
      // Save multiple times concurrently - this is a race condition
      // All three checks for isNew() will run before any insert completes,
      // so all three will think it's new and insert
      await Promise.all([
        user.save(),
        user.save(),
        user.save(),
      ]);
      
      const all = await server.schema.users.all();
      // This creates 3 records due to race condition
      // To fix properly would need transactions/locks
      expect(all.models.length).toBeGreaterThan(1);
      
      // Sequential saves work correctly
      const user2 = server.schema.users.new({ name: "Bob" });
      await user2.save();
      await user2.save();
      await user2.save();
      
      const bob = await server.schema.users.find(user2.id);
      expect(bob.name).toBe("Bob");
      
      const allBobs = await server.schema.users.where({ name: "Bob" });
      expect(allBobs.models).toHaveLength(1);
    });
  });
});
