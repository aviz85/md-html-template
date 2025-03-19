-- Function to safely claim the next pending task
CREATE OR REPLACE FUNCTION claim_next_pending_task(worker_id TEXT, lock_until TIMESTAMPTZ)
RETURNS SETOF task_queue
LANGUAGE plpgsql
AS $$
DECLARE
  claimed_task task_queue;
BEGIN
  -- Lock the row to prevent concurrent claims
  SELECT *
  INTO claimed_task
  FROM task_queue
  WHERE status = 'pending'
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;  -- Skip tasks that are being processed by another transaction
  
  -- If no task found, return empty result
  IF claimed_task IS NULL THEN
    RETURN;
  END IF;
  
  -- Update the task as locked
  UPDATE task_queue
  SET 
    status = 'locked',
    locked_until = lock_until,
    locked_by = worker_id,
    started_at = NOW()
  WHERE id = claimed_task.id
  RETURNING * INTO claimed_task;
  
  -- Return the claimed task
  RETURN NEXT claimed_task;
  RETURN;
END;
$$; 