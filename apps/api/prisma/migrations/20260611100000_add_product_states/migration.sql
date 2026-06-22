-- Product.states — AU states the product applies to (empty = all states)
ALTER TABLE "Product" ADD COLUMN "states" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
