-- Film-review clips now upload to the private `review-videos` bucket. Raise its
-- per-file size limit to 200 MB so real phone clips aren't rejected. (On the
-- Free plan the project-wide 50 MB upload cap still applies; this matters on Pro.)
update storage.buckets set file_size_limit = 209715200 where id = 'review-videos';
