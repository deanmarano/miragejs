import { Server, Model } from "miragejs";

describe("Unit | Async Mode", function () {
  let server;

  afterEach(() => {
    if (server) {
      server.shutdown();
    }
  });

  describe("Sync mode (default)", () => {
    beforeEach(() => {
      server = new Server({
        environment: "test",
        models: {
          user: Model,
        },
      });
      server.timing = 0;
      server.logging = false;
    });

    test("async config defaults to false", () => {
      expect(server.async).toBe(false);
    });

    test("db operations return values directly", () => {
      const user = server.db.users.insert({ name: "Alice" });
      
      expect(user).toEqual({ id: "1", name: "Alice" });
      expect(user.then).toBeUndefined(); // Not a Promise
    });

    test("schema operations return values directly", () => {
      const user = server.schema.users.create({ name: "Bob" });
      
      expect(user.name).toBe("Bob");
      expect(user.then).toBeUndefined(); // Not a Promise
    });

    test("db.all returns array directly", () => {
      server.db.users.insert({ name: "Alice" });
      server.db.users.insert({ name: "Bob" });
      
      const users = server.db.users;
      
      expect(Array.isArray(users)).toBe(true);
      expect(users).toHaveLength(2);
    });

    test("find, findBy, where return values directly", () => {
      server.db.users.insert({ id: "1", name: "Alice" });
      server.db.users.insert({ id: "2", name: "Bob" });
      
      const found = server.db.users.find("1");
      const foundBy = server.db.users.findBy({ name: "Alice" });
      const where = server.db.users.where({ name: "Bob" });
      
      expect(found).toEqual({ id: "1", name: "Alice" });
      expect(foundBy).toEqual({ id: "1", name: "Alice" });
      expect(where).toEqual([{ id: "2", name: "Bob" }]);
      
      expect(found.then).toBeUndefined();
      expect(foundBy.then).toBeUndefined();
      expect(where.then).toBeUndefined();
    });
  });

  describe("Async mode", () => {
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

    test("async config is set to true", () => {
      expect(server.async).toBe(true);
    });

    test("db operations return Promises", async () => {
      const userPromise = server.db.users.insert({ name: "Alice" });
      
      expect(userPromise.then).toBeDefined(); // Is a Promise
      
      const user = await userPromise;
      expect(user).toEqual({ id: "1", name: "Alice" });
    });

    test("schema operations return Promises", async () => {
      const userPromise = server.schema.users.create({ name: "Bob" });
      
      expect(userPromise.then).toBeDefined(); // Is a Promise
      
      const user = await userPromise;
      expect(user.name).toBe("Bob");
    });

    test("db.all returns Promise of array", async () => {
      await server.db.users.insert({ name: "Alice" });
      await server.db.users.insert({ name: "Bob" });
      
      const usersPromise = server.db.users.all();
      
      expect(usersPromise.then).toBeDefined(); // Is a Promise
      
      const users = await usersPromise;
      expect(Array.isArray(users)).toBe(true);
      expect(users).toHaveLength(2);
    });

    test("find returns Promise", async () => {
      await server.db.users.insert({ id: "1", name: "Alice" });
      
      const foundPromise = server.db.users.find("1");
      
      expect(foundPromise.then).toBeDefined();
      
      const found = await foundPromise;
      expect(found).toEqual({ id: "1", name: "Alice" });
    });

    test("findBy returns Promise", async () => {
      await server.db.users.insert({ name: "Alice" });
      
      const foundPromise = server.db.users.findBy({ name: "Alice" });
      
      expect(foundPromise.then).toBeDefined();
      
      const found = await foundPromise;
      expect(found.name).toBe("Alice");
    });

    test("where returns Promise", async () => {
      await server.db.users.insert({ name: "Alice" });
      await server.db.users.insert({ name: "Bob" });
      
      const wherePromise = server.db.users.where({ name: "Bob" });
      
      expect(wherePromise.then).toBeDefined();
      
      const results = await wherePromise;
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Bob");
    });

    test("update returns Promise", async () => {
      await server.db.users.insert({ id: "1", name: "Alice" });
      
      const updatePromise = server.db.users.update("1", { name: "Alicia" });
      
      expect(updatePromise.then).toBeDefined();
      
      const updated = await updatePromise;
      expect(updated.name).toBe("Alicia");
    });

    test("remove returns Promise", async () => {
      await server.db.users.insert({ id: "1", name: "Alice" });
      
      const removePromise = server.db.users.remove("1");
      
      expect(removePromise.then).toBeDefined();
      
      await removePromise;
      
      const users = await server.db.users.all();
      expect(users).toHaveLength(0);
    });

    test("firstOrCreate returns Promise", async () => {
      const createPromise = server.db.users.firstOrCreate({ name: "Alice" });
      
      expect(createPromise.then).toBeDefined();
      
      const created = await createPromise;
      expect(created.name).toBe("Alice");
      
      // Second call should find existing
      const foundPromise = server.db.users.firstOrCreate({ name: "Alice" });
      const found = await foundPromise;
      
      expect(found.id).toBe(created.id);
    });

    test("schema.all returns Promise", async () => {
      await server.schema.users.create({ name: "Alice" });
      await server.schema.users.create({ name: "Bob" });
      
      const allPromise = server.schema.users.all();
      
      expect(allPromise.then).toBeDefined();
      
      const all = await allPromise;
      expect(all.models).toHaveLength(2);
    });

    test("schema.find returns Promise", async () => {
      const user = await server.schema.users.create({ name: "Alice" });
      
      const foundPromise = server.schema.users.find(user.id);
      
      expect(foundPromise.then).toBeDefined();
      
      const found = await foundPromise;
      expect(found.name).toBe("Alice");
    });

    test("schema.findBy returns Promise", async () => {
      await server.schema.users.create({ name: "Alice" });
      
      const foundPromise = server.schema.users.findBy({ name: "Alice" });
      
      expect(foundPromise.then).toBeDefined();
      
      const found = await foundPromise;
      expect(found.name).toBe("Alice");
    });

    test("schema.where returns Promise", async () => {
      await server.schema.users.create({ name: "Alice" });
      await server.schema.users.create({ name: "Bob" });
      
      const wherePromise = server.schema.users.where({ name: "Bob" });
      
      expect(wherePromise.then).toBeDefined();
      
      const results = await wherePromise;
      expect(results.models).toHaveLength(1);
      expect(results.models[0].name).toBe("Bob");
    });

    test("schema.first returns Promise", async () => {
      await server.schema.users.create({ name: "Alice" });
      await server.schema.users.create({ name: "Bob" });
      
      const firstPromise = server.schema.users.first();
      
      expect(firstPromise.then).toBeDefined();
      
      const first = await firstPromise;
      expect(first.name).toBe("Alice");
    });
  });

  describe("Backward compatibility", () => {
    test("existing sync code continues to work", () => {
      server = new Server({
        environment: "test",
        models: {
          user: Model,
        },
        routes() {
          this.get("/users", (schema) => {
            // This should work without async/await
            return schema.users.all();
          });
        },
      });
      server.timing = 0;
      server.logging = false;

      server.create("user", { name: "Alice" });
      server.create("user", { name: "Bob" });

      // Route handler should work in sync mode
      expect(() => {
        server.get("/users");
      }).not.toThrow();
    });
  });
});
